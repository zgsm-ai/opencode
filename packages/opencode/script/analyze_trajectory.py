#!/usr/bin/env python3
"""
Agent 轨迹分析工具

分析轨迹 JSON（格式 trajectory_<changeID>_<sessionID>_<YYYYMMDD_HHMMSS>_<agent>.json），提供：
- 高频工具错误分析
- 简洁回放 agent 运行过程
- 开发优化洞察
- bash 等工具的命令/参数分析

依赖: pip install rich  (或 pip install -r script/requirements.txt)

Usage:
  python script/analyze_trajectory.py <path>                  # 指定轨迹 JSON 或目录（默认当前目录）
  python script/analyze_trajectory.py <path> --replay         # 简洁回放模式
  python script/analyze_trajectory.py <path> --replay-fold-ok # 回放时折叠仅成功的步骤
  python script/analyze_trajectory.py <path> --top 10         # 显示 Top N
  python script/analyze_trajectory.py <path> -o out.csv       # 导出 CSV
  python script/analyze_trajectory.py <path> -o out.csv --full # 导出 CSV 含更多列
  python script/analyze_trajectory.py <path> --all           # 列出目录下所有轨迹摘要
  python script/analyze_trajectory.py <path1> <path2> --compare # 对比两个轨迹
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

# 需要人工交互的工具（计算纯 Agent 耗时时排除）
HUMAN_INTERACTION_TOOLS = frozenset({"question", "show_markdown_to_user"})


def is_human_interaction_tool(name: str) -> bool:
    return name in HUMAN_INTERACTION_TOOLS


# ---------------------------------------------------------------------------
# Types (dataclasses mirror TS interfaces)
# ---------------------------------------------------------------------------


@dataclass
class ToolCallInfo:
    name: str
    call_id: str | None
    arguments: dict[str, Any]
    success: bool
    error_message: str | None
    result_size: int | None
    estimated_duration_seconds: float | None


@dataclass
class StepAnalysis:
    step_number: int
    timestamp: str
    duration_seconds: float | None
    tool_calls: list[ToolCallInfo]
    tool_call_count: int
    has_error: bool
    error_message: str | None


@dataclass
class TrajectoryMeta:
    model_id: str
    provider_id: str
    agent_mode: str
    is_codex: bool | None


@dataclass
class TrajectoryFile:
    file_path: str
    session_id: str
    file_timestamp: Any  # datetime-like
    agent_type: str
    agent_name: str
    analyses: list[StepAnalysis]
    meta: TrajectoryMeta | None = None
    parameters: dict[str, Any] | None = None
    tool_names: list[str] | None = None
    system_prompt_count: int | None = None


# ---------------------------------------------------------------------------
# Parser: OpenCode format (messages) -> StepAnalysis
# ---------------------------------------------------------------------------


def command_summary(tc: ToolCallInfo) -> str | None:
    if not tc.arguments:
        return None
    if tc.name == "bash":
        cmd = tc.arguments.get("command")
        return cmd.strip() if isinstance(cmd, str) and cmd.strip() else None
    if tc.name == "str_replace_based_edit_tool":
        cmd = tc.arguments.get("command")
        p = tc.arguments.get("path")
        view_range = tc.arguments.get("view_range")
        if cmd == "view":
            return f"view {p} range={json.dumps(view_range)}" if view_range else f"view {p}"
        return f"{cmd} {p}" if cmd and p else None
    if tc.name == "quick_explore":
        target = tc.arguments.get("exploration_target")
        if isinstance(target, str):
            return target[:80] + ("..." if len(target) > 80 else "")
        return None
    return None


def parse_open_code_trajectory(data: dict[str, Any]) -> list[StepAnalysis]:
    messages = data.get("actualRequest", {}).get("messages") or []
    analyses: list[StepAnalysis] = []
    step_number = 0

    result_map: dict[str, dict[str, str]] = {}
    for msg in messages:
        if msg.get("role") != "tool":
            continue
        content = msg.get("content")
        if not content or not isinstance(content, list):
            continue
        for c in content:
            if c.get("type") not in ("tool-result", "tool_result"):
                continue
            call_id = c.get("toolCallId") or c.get("tool_call_id")
            if not call_id:
                continue
            out = c.get("output") or {}
            t = out.get("type", "text")
            val = out.get("value") if isinstance(out.get("value"), str) else ""
            result_map[call_id] = {"type": t, "value": val}

    duration_map: dict[str, float] = {}
    for ex in data.get("toolExecutions") or []:
        cid = ex.get("callID")
        ms = ex.get("durationMs")
        if cid is not None and isinstance(ms, (int, float)) and ms >= 0:
            duration_map[cid] = ms / 1000.0

    for msg in messages:
        if not msg or msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if not content or not isinstance(content, list):
            continue

        tool_calls: list[ToolCallInfo] = []
        for c in content:
            if c.get("type") not in ("tool-call", "tool_call") or not c.get("name"):
                continue

            call_id = c.get("toolCallId") or c.get("tool_call_id")
            args = c.get("arguments") or {}
            result = result_map.get(call_id) if call_id else None
            duration_sec = duration_map.get(call_id) if call_id else None

            is_error = (
                (result and result.get("type") == "error-text")
                or (result and result.get("value", "").startswith("Error:"))
            )
            success = not is_error
            err_msg = result.get("value") if is_error and result else None
            result_size = len(result["value"]) if result and result.get("value") else None

            tool_calls.append(
                ToolCallInfo(
                    name=c["name"],
                    call_id=call_id,
                    arguments=args,
                    success=success,
                    error_message=err_msg,
                    result_size=result_size,
                    estimated_duration_seconds=duration_sec,
                )
            )

        if not tool_calls:
            continue

        step_number += 1
        has_error = any(not t.success for t in tool_calls)
        err_msg = next((t.error_message for t in tool_calls if t.error_message), None)
        step_duration = sum(t.estimated_duration_seconds or 0 for t in tool_calls) or None

        analyses.append(
            StepAnalysis(
                step_number=step_number,
                timestamp="",
                duration_seconds=step_duration,
                tool_calls=tool_calls,
                tool_call_count=len(tool_calls),
                has_error=has_error,
                error_message=err_msg,
            )
        )

    return analyses


def parse_timestamp(text: str) -> Any | None:
    clean = re.sub(r"[-_]", "", text)
    if not re.match(r"^\d{14}$", clean):
        return None
    from datetime import datetime

    try:
        return datetime(
            int(clean[0:4]),
            int(clean[4:6]),
            int(clean[6:8]),
            int(clean[8:10]),
            int(clean[10:12]),
            int(clean[12:14]),
        )
    except ValueError:
        return None


# 当前命名格式（opencode llm.ts）: trajectory_<changeID>_<sessionID>_<YYYYMMDD_HHMMSS>_<agent>.json
TRAJECTORY_FILENAME_RE = re.compile(
    r"^trajectory_[A-Za-z0-9][A-Za-z0-9._-]*_ses_[A-Za-z0-9]+_\d{8}_\d{6}_.+\.json$"
)


def parse_filename(filename: str) -> dict[str, Any] | None:
    # trajectory_<changeID>_<sessionID>_<YYYYMMDD_HHMMSS>_<agent>.json
    m = re.match(
        r"^trajectory_([A-Za-z0-9][A-Za-z0-9._-]*)_(ses_[A-Za-z0-9]+)_(\d{8}_\d{6})_(.+)\.json$",
        filename,
    )
    if not m:
        return None
    ts = parse_timestamp(m.group(3))
    if not ts:
        return None
    agent = m.group(4)
    return {"agent_type": agent, "agent_name": agent, "timestamp": ts}


def load_trajectory(file_path: str) -> TrajectoryFile | None:
    try:
        with open(file_path, encoding="utf-8") as f:
            raw = f.read()
    except OSError:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    actual = data.get("actualRequest") or {}
    messages = actual.get("messages") or []
    if not isinstance(messages, list):
        return None

    analyses = parse_open_code_trajectory(data)
    if not analyses:
        return None

    from datetime import datetime

    parsed = parse_filename(os.path.basename(file_path))
    session_id = data.get("sessionID") or "unknown"
    meta_dict = data.get("meta") or {}
    agent_type = meta_dict.get("agent") or (parsed["agent_type"] if parsed else "unknown")
    agent_name = (parsed["agent_name"] if parsed else None) or agent_type
    ts_val = data.get("timestamp")
    if ts_val is not None and ts_val > 1e12:
        ts_val = ts_val / 1000.0  # 毫秒 -> 秒
    file_ts = (
        parsed["timestamp"]
        if parsed
        else (datetime.fromtimestamp(ts_val) if ts_val is not None else datetime.now())
    )

    traj_meta: TrajectoryMeta | None = None
    if meta_dict:
        traj_meta = TrajectoryMeta(
            model_id=meta_dict.get("modelID") or "",
            provider_id=meta_dict.get("providerID") or "",
            agent_mode=meta_dict.get("agentMode") or "",
            is_codex=meta_dict.get("isCodex") if "isCodex" in meta_dict else None,
        )

    params = actual.get("parameters")
    if not isinstance(params, dict):
        params = None

    tools = actual.get("tools")
    tool_names_list: list[str] | None = None
    if isinstance(tools, list):
        tool_names_list = []
        for t in tools:
            if isinstance(t, dict) and t.get("type") == "function":
                fn = t.get("function")
                if isinstance(fn, dict) and fn.get("name"):
                    tool_names_list.append(str(fn["name"]))
            elif isinstance(t, dict) and t.get("name"):
                tool_names_list.append(str(t["name"]))

    system_prompts = data.get("systemPrompts") or {}
    sp_array = system_prompts.get("array") if isinstance(system_prompts, dict) else None
    sp_count = len(sp_array) if isinstance(sp_array, list) else None

    return TrajectoryFile(
        file_path=file_path,
        session_id=session_id,
        file_timestamp=file_ts,
        agent_type=agent_type,
        agent_name=agent_name,
        analyses=analyses,
        meta=traj_meta,
        parameters=params,
        tool_names=tool_names_list,
        system_prompt_count=sp_count,
    )


# ---------------------------------------------------------------------------
# Bash analysis
# ---------------------------------------------------------------------------


def extract_bash_command(tc: ToolCallInfo) -> str | None:
    if tc.name != "bash":
        return None
    cmd = tc.arguments.get("command")
    if not isinstance(cmd, str):
        return None
    normalized = " ".join(cmd.strip().split())
    return normalized or None


def bash_command_key(cmd: str) -> str:
    normalized = " ".join(cmd.strip().split())
    if "&&" in normalized:
        parts = [p.strip() for p in normalized.split("&&") if p.strip()]
        if len(parts) >= 2 and parts[0].startswith("cd "):
            return " && ".join(parts[1:])
    return normalized


def percentile(sorted_arr: list[float], p: float) -> float:
    if not sorted_arr:
        return 0.0
    first, last = sorted_arr[0], sorted_arr[-1]
    if p <= 0:
        return first
    if p >= 100:
        return last
    k = (len(sorted_arr) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(sorted_arr) - 1)
    vf, vc = sorted_arr[f], sorted_arr[c]
    if f == c:
        return vf
    return vf * (c - k) + vc * (k - f)


def normalize_whitespace(s: str) -> str:
    return " ".join(s.strip().split())


# ---------------------------------------------------------------------------
# Error analysis
# ---------------------------------------------------------------------------

ERROR_KEYWORDS = ("view_range", "timeout", "ENOENT", "EACCES", "ECONNREFUSED", "permission", "SyntaxError", "NotFound")


def _error_type_key(msg: str) -> str:
    n = normalize_whitespace(msg)
    if not n:
        return "未知"
    if n.startswith("Error:"):
        first = n[6:].strip().split("\n")[0][:60]
        return f"Error: {first}" + ("..." if len(first) >= 60 else "")
    for kw in ERROR_KEYWORDS:
        if kw in n:
            return kw
    return n[:50] + ("..." if len(n) > 50 else "")


def compute_error_clusters(analyses: list[StepAnalysis]) -> dict[str, dict[str, Any]]:
    clusters: dict[str, dict[str, Any]] = {}
    for a in analyses:
        for tc in a.tool_calls:
            if not tc.error_message:
                continue
            key = _error_type_key(tc.error_message)
            cur = clusters.setdefault(key, {"count": 0, "examples": []})
            cur["count"] += 1
            if len(cur["examples"]) < 2:
                cur["examples"].append((a.step_number, truncate(normalize_whitespace(tc.error_message), 70)))
    return clusters


def compute_first_failure_step(analyses: list[StepAnalysis]) -> int | None:
    for a in analyses:
        if a.has_error:
            return a.step_number
    return None


def compute_max_consecutive_failures(analyses: list[StepAnalysis]) -> int:
    max_run = 0
    run = 0
    for a in analyses:
        if a.has_error:
            run += 1
            max_run = max(max_run, run)
        else:
            run = 0
    return max_run


def steps_duration_bars(
    analyses: list[StepAnalysis], exclude_human: bool = True
) -> list[tuple[int, float, bool]]:
    """Return (step_number, duration_sec, has_error) per step. Duration excludes human tools when exclude_human."""
    out: list[tuple[int, float, bool]] = []
    for a in analyses:
        if exclude_human:
            dur = sum(
                tc.estimated_duration_seconds or 0
                for tc in a.tool_calls
                if not is_human_interaction_tool(tc.name)
            )
        else:
            dur = a.duration_seconds or 0
        out.append((a.step_number, dur, a.has_error))
    return out


def edit_tool_stats(analyses: list[StepAnalysis]) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """(command -> {total, success}, path -> count) for str_replace_based_edit_tool."""
    by_cmd: dict[str, dict[str, Any]] = {}
    by_path: dict[str, int] = {}
    for a in analyses:
        for tc in a.tool_calls:
            if tc.name != "str_replace_based_edit_tool":
                continue
            cmd = (tc.arguments or {}).get("command")
            ckey = str(cmd) if cmd else "unknown"
            cur = by_cmd.setdefault(ckey, {"total": 0, "success": 0})
            cur["total"] += 1
            if tc.success:
                cur["success"] += 1
            p = (tc.arguments or {}).get("path")
            if isinstance(p, str):
                key = p.strip() or "—"
                by_path[key] = by_path.get(key, 0) + 1
    return by_cmd, by_path


def quick_explore_stats(analyses: list[StepAnalysis]) -> dict[str, dict[str, Any]]:
    """exploration_target (normalized) -> {total, success}."""
    by_target: dict[str, dict[str, Any]] = {}
    for a in analyses:
        for tc in a.tool_calls:
            if tc.name != "quick_explore":
                continue
            t = (tc.arguments or {}).get("exploration_target")
            key = (t[:60] + "…" if isinstance(t, str) and len(t) > 60 else t) or "—"
            key = str(key).strip()
            cur = by_target.setdefault(key, {"total": 0, "success": 0})
            cur["total"] += 1
            if tc.success:
                cur["success"] += 1
    return by_target


def compute_tool_pairs(analyses: list[StepAnalysis]) -> dict[tuple[str, str], int]:
    """(A, B) -> count: same-step and adjacent-step pairs."""
    pairs: dict[tuple[str, str], int] = {}
    prev_tools: list[str] = []
    for a in analyses:
        names = [tc.name for tc in a.tool_calls]
        for i in range(len(names) - 1):
            key = (names[i], names[i + 1])
            pairs[key] = pairs.get(key, 0) + 1
        if prev_tools and names:
            key = (prev_tools[-1], names[0])
            pairs[key] = pairs.get(key, 0) + 1
        prev_tools = names
    return pairs


def compute_tool_count_per_step(analyses: list[StepAnalysis]) -> dict[int, int]:
    """count -> number of steps with that many tool calls."""
    dist: dict[int, int] = {}
    for a in analyses:
        n = a.tool_call_count
        dist[n] = dist.get(n, 0) + 1
    return dist


def result_size_stats(analyses: list[StepAnalysis], large_threshold: int = 50_000) -> tuple[dict[str, dict[str, Any]], list[tuple[int, str, int]]]:
    """Per-tool {total, count, avg, max}, and list of (step, tool, size) for size > large_threshold."""
    by_tool: dict[str, dict[str, Any]] = {}
    large: list[tuple[int, str, int]] = []
    for a in analyses:
        for tc in a.tool_calls:
            if tc.result_size is None:
                continue
            cur = by_tool.setdefault(tc.name, {"total": 0, "count": 0, "max": 0})
            cur["total"] += tc.result_size
            cur["count"] += 1
            cur["max"] = max(cur["max"], tc.result_size)
            if tc.result_size > large_threshold:
                large.append((a.step_number, tc.name, tc.result_size))
    for d in by_tool.values():
        c = d["count"]
        d["avg"] = d["total"] / c if c else 0
    return by_tool, large


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------


def format_seconds(sec: float | None) -> str:
    if sec is None or (isinstance(sec, float) and (sec != sec)):  # NaN
        return "N/A"
    if sec < 60:
        return f"{sec:.2f}s"
    if sec < 3600:
        return f"{sec / 60:.2f}m"
    return f"{sec / 3600:.2f}h"


def truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def format_chars(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def box(title: str, style: str = "cyan") -> Panel:
    return Panel(Text.from_markup(f"[bold]{title}[/bold]"), border_style=style, padding=(0, 1))


# ---------------------------------------------------------------------------
# Output: Single file summary (rich)
# ---------------------------------------------------------------------------


def print_summary(traj: TrajectoryFile, top_n: int = 5) -> None:
    analyses = traj.analyses
    if not analyses:
        console.print("[red]没有找到步骤数据[/red]")
        return

    total_steps = len(analyses)
    total_tool_calls = sum(a.tool_call_count for a in analyses)
    error_steps = [a for a in analyses if a.has_error]
    error_count = len(error_steps)

    tool_stats: dict[str, dict[str, Any]] = {}
    tool_events: list[tuple[int, ToolCallInfo]] = []
    for a in analyses:
        for tc in a.tool_calls:
            cur = tool_stats.setdefault(
                tc.name,
                {"total": 0, "success": 0, "failed": 0, "durations": [], "with_duration": 0},
            )
            cur["total"] += 1
            if tc.success:
                cur["success"] += 1
            else:
                cur["failed"] += 1
            if tc.estimated_duration_seconds is not None:
                cur["durations"].append(tc.estimated_duration_seconds)
                cur["with_duration"] += 1
            tool_events.append((a.step_number, tc))

    total_duration_sec = sum(
        sum(x["durations"]) for x in tool_stats.values()
    )
    duration_excl_human = sum(
        sum(x["durations"]) for name, x in tool_stats.items() if not is_human_interaction_tool(name)
    )
    human_count = sum(
        len(x["durations"]) for name, x in tool_stats.items() if is_human_interaction_tool(name)
    )

    console.print()
    console.print(box("Agent 轨迹分析", "cyan"))
    console.print()

    overall = Table(show_header=True, header_style="bold")
    overall.add_column("指标", width=25)
    overall.add_column("值", width=40)
    overall.add_row("总步骤数", str(total_steps))
    overall.add_row("总工具调用次数", str(total_tool_calls))
    pct_err = (error_count / total_steps * 100) if total_steps else 0
    overall.add_row("错误步骤数", f"{error_count} ({pct_err:.1f}%)")
    first_fail = compute_first_failure_step(analyses)
    if first_fail is not None:
        overall.add_row("首次失败步骤", str(first_fail))
    max_consec = compute_max_consecutive_failures(analyses)
    if max_consec > 0:
        overall.add_row("最大连续失败步数", str(max_consec))
    overall.add_row("工具总耗时", format_seconds(total_duration_sec) if total_duration_sec > 0 else "N/A")
    human_note = f" (已排除 {human_count} 次人交互)" if human_count > 0 else ""
    overall.add_row(
        "纯Agent耗时",
        (format_seconds(duration_excl_human) + human_note) if duration_excl_human > 0 else "N/A",
    )
    if total_tool_calls > 0 and (human_count > 0 or total_duration_sec > 0):
        human_pct = f"{human_count / total_tool_calls * 100:.1f}%" if human_count > 0 else "0%"
        human_dur = total_duration_sec - duration_excl_human
        human_dur_pct = f"{human_dur / total_duration_sec * 100:.1f}%" if total_duration_sec > 0 and human_dur > 0 else "0%"
        overall.add_row("人交互占比 (次数)", human_pct)
        overall.add_row("人交互占比 (耗时)", human_dur_pct)
    overall.add_row("文件", truncate(traj.file_path, 50))
    overall.add_row("Agent", traj.agent_name)
    overall.add_row("Session", traj.session_id[:20] + "...")
    console.print(overall)
    console.print()

    if traj.meta or traj.parameters:
        env_rows: list[tuple[str, str]] = []
        if traj.meta and (traj.meta.model_id or traj.meta.provider_id or traj.meta.agent_mode):
            if traj.meta.model_id:
                env_rows.append(("modelID", traj.meta.model_id))
            if traj.meta.provider_id:
                env_rows.append(("providerID", traj.meta.provider_id))
            if traj.meta.agent_mode:
                env_rows.append(("agentMode", traj.meta.agent_mode))
            if traj.meta.is_codex is not None:
                env_rows.append(("isCodex", str(traj.meta.is_codex)))
        if traj.parameters:
            for k in ("temperature", "maxOutputTokens", "topP", "topK"):
                v = traj.parameters.get(k)
                if v is not None:
                    env_rows.append((k, str(v)))
        if env_rows:
            env_table = Table(show_header=True, header_style="bold")
            env_table.add_column("运行环境", width=20)
            env_table.add_column("值", width=45)
            for k, v in env_rows:
                env_table.add_row(k, truncate(v, 50))
            console.print("[cyan]运行环境[/cyan]")
            console.print(env_table)
            console.print()
        if traj.tool_names:
            console.print("[cyan]启用工具[/cyan] " + ", ".join(traj.tool_names[:20]) + (" ..." if len(traj.tool_names) > 20 else ""))
            console.print()
        if traj.system_prompt_count is not None:
            console.print(f"[dim]系统提示词条数: {traj.system_prompt_count}[/dim]")
            console.print()

    if tool_stats:
        tool_table = Table(show_header=True, header_style="bold")
        tool_table.add_column("工具", width=22)
        tool_table.add_column("调用", width=8)
        tool_table.add_column("有耗时", width=8)
        tool_table.add_column("成功率", width=10)
        tool_table.add_column("失败", width=8)
        tool_table.add_column("总耗时", width=10)
        tool_table.add_column("平均", width=10)

        sorted_tools = sorted(
            tool_stats.items(),
            key=lambda t: (sum(t[1]["durations"]), t[1]["total"]),
            reverse=True,
        )
        for name, s in sorted_tools[:15]:
            rate = f"{s['success'] / s['total'] * 100:.1f}%" if s["total"] else "N/A"
            total_dur = sum(s["durations"])
            avg_dur = total_dur / len(s["durations"]) if s["durations"] else 0
            label = f"{name} (人交互)" if is_human_interaction_tool(name) else name
            no_dur = s["total"] - s["with_duration"]
            tool_table.add_row(
                label,
                str(s["total"]),
                str(s["with_duration"]) + (f" (-{no_dur})" if no_dur else ""),
                rate,
                str(s["failed"]),
                format_seconds(total_dur) if total_dur > 0 else "N/A",
                format_seconds(avg_dur) if avg_dur > 0 else "N/A",
            )
        total_calls = sum(x["total"] for x in tool_stats.values())
        total_success = sum(x["success"] for x in tool_stats.values())
        total_dur = sum(sum(x["durations"]) for x in tool_stats.values())
        total_with_dur = sum(len(x["durations"]) for x in tool_stats.values())
        total_no_dur = total_calls - total_with_dur
        overall_rate = f"{total_success / total_calls * 100:.1f}%" if total_calls else "N/A"
        overall_avg = total_dur / total_with_dur if total_with_dur else None
        tool_table.add_row(
            "TOTAL",
            str(total_calls),
            str(total_with_dur) + (f" (-{total_no_dur})" if total_no_dur else ""),
            overall_rate,
            str(total_calls - total_success),
            format_seconds(total_dur if total_with_dur else None),
            format_seconds(overall_avg),
        )
        console.print("[cyan]工具调用统计（含耗时）[/cyan]")
        console.print(tool_table)
        console.print()

    events_with_duration = [
        (step, tc)
        for step, tc in tool_events
        if tc.estimated_duration_seconds is not None and not is_human_interaction_tool(tc.name)
    ]
    if events_with_duration:
        sorted_by_dur = sorted(
            events_with_duration,
            key=lambda e: e[1].estimated_duration_seconds or 0,
            reverse=True,
        )
        hot_table = Table(show_header=True, header_style="bold")
        hot_table.add_column("耗时", width=10)
        hot_table.add_column("步骤", width=8)
        hot_table.add_column("工具", width=22)
        hot_table.add_column("状态", width=8)
        hot_table.add_column("摘要", width=50)
        for step, tc in sorted_by_dur[: min(top_n, 10)]:
            dur = tc.estimated_duration_seconds or 0
            status = "OK" if tc.success else "FAIL"
            summary = command_summary(tc) or tc.name
            hot_table.add_row(format_seconds(dur), str(step), tc.name, status, truncate(summary, 70))
        console.print(f"[cyan]最耗时的工具调用 (Top {min(top_n, 10)}，已排除人交互工具)[/cyan]")
        console.print(hot_table)
        console.print()

    step_bars = steps_duration_bars(analyses, exclude_human=True)
    if step_bars:
        max_dur = max(d for _, d, _ in step_bars) or 1
        n_steps = len(step_bars)
        chart_height = 6
        chart_width = min(n_steps, 80)
        if n_steps > chart_width:
            indices = [i * (n_steps - 1) // (chart_width - 1) if chart_width > 1 else 0 for i in range(chart_width)]
            sampled = [step_bars[i] for i in indices]
        else:
            sampled = step_bars
        w = len(sampled)
        # row 0 = 最大耗时, row (chart_height-1) = 最小耗时
        def row_for(d: float) -> int:
            if max_dur <= 0:
                return chart_height - 1
            r = (chart_height - 1) - round((d / max_dur) * (chart_height - 1))
            return max(0, min(chart_height - 1, r))

        rows_by_col = [row_for(d) for _, d, _ in sampled]
        err_steps = [step for step, _, has_err in step_bars if has_err]

        grid = [[" " for _ in range(w)] for _ in range(chart_height)]
        for c in range(w - 1):
            r0, r1 = rows_by_col[c], rows_by_col[c + 1]
            lo, hi = min(r0, r1), max(r0, r1)
            for r in range(lo, hi + 1):
                if r0 != r1:
                    x = c + (r - r0) / (r1 - r0)
                else:
                    x = c
                col = round(x)
                if 0 <= col < w and grid[r][col] == " ":
                    grid[r][col] = "·"
        for c in range(w):
            r = rows_by_col[c]
            _, _, has_err = sampled[c]
            grid[r][c] = "✗" if has_err else "●"

        console.print("[cyan]步骤耗时分布 (已排除人交互)[/cyan]")
        y_label_width = 6
        for r in range(chart_height):
            if max_dur > 0:
                frac = 1 - r / (chart_height - 1)
                label = format_seconds(frac * max_dur)
            else:
                label = "0"
            line = "".join(grid[r])
            console.print(f"[dim]{label:>6}[/dim] │{line}")
        console.print("[dim]" + " " * (y_label_width + 1) + "└" + "─" * w + "[/dim]")
        if w < n_steps:
            console.print(f"[dim]步骤 1 … {n_steps} (共 {n_steps} 步，已压缩为 {w} 点)[/dim]")
        else:
            console.print(f"[dim]步骤 1 … {n_steps}[/dim]")
        if err_steps:
            console.print(f"[dim]错误步: {err_steps[:12]}{'…' if len(err_steps) > 12 else ''}[/dim]")
        console.print()

    count_dist = compute_tool_count_per_step(analyses)
    if count_dist:
        dist_table = Table(show_header=True, header_style="bold")
        dist_table.add_column("每步工具数", width=14)
        dist_table.add_column("步骤数", width=10)
        dist_table.add_column("bar", width=30)
        for k in sorted(count_dist.keys()):
            v = count_dist[k]
            bar_len = round((v / max(count_dist.values())) * 25)
            dist_table.add_row(str(k), str(v), "█" * bar_len)
        console.print("[cyan]每步工具数分布[/cyan]")
        console.print(dist_table)
        console.print()

    size_by_tool, large_results = result_size_stats(analyses)
    if size_by_tool:
        size_table = Table(show_header=True, header_style="bold")
        size_table.add_column("工具", width=22)
        size_table.add_column("调用数", width=8)
        size_table.add_column("总字符", width=10)
        size_table.add_column("平均", width=10)
        size_table.add_column("最大", width=10)
        for name, d in sorted(size_by_tool.items(), key=lambda x: -x[1]["total"])[:10]:
            size_table.add_row(
                name,
                str(d["count"]),
                format_chars(d["total"]),
                format_chars(int(d["avg"])),
                format_chars(d["max"]),
            )
        console.print("[cyan]结果大小分布 (result_size)[/cyan]")
        console.print(size_table)
        console.print()
    if large_results:
        big_table = Table(show_header=True, header_style="bold")
        big_table.add_column("步骤", width=8)
        big_table.add_column("工具", width=22)
        big_table.add_column("字符数", width=12)
        for step, tool, size in sorted(large_results, key=lambda x: -x[2])[:8]:
            big_table.add_row(str(step), tool, format_chars(size))
        console.print("[yellow]单次返回较大 (>50K 字符)[/yellow]")
        console.print(big_table)
        console.print()

    failed_events: list[tuple[int, str, str, str]] = []
    for a in analyses:
        for tc in a.tool_calls:
            if not tc.success:
                failed_events.append(
                    (a.step_number, tc.name, command_summary(tc) or tc.name, tc.error_message or ""),
                )

    if failed_events:
        fail_by_tool: dict[str, dict[str, Any]] = {}
        for step, name, summary, err in failed_events:
            cur = fail_by_tool.setdefault(name, {"count": 0, "examples": []})
            cur["count"] += 1
            if len(cur["examples"]) < 3:
                cur["examples"].append({"step": step, "summary": summary, "err": err})

        fail_table = Table(show_header=True, header_style="bold")
        fail_table.add_column("工具", width=22)
        fail_table.add_column("失败次数", width=12)
        fail_table.add_column("示例", width=60)
        sorted_fail = sorted(fail_by_tool.items(), key=lambda x: x[1]["count"], reverse=True)
        for name, s in sorted_fail[:5]:
            examples = "\n".join(
                f"{e['step']}: {truncate(e['summary'], 40)} | {truncate(normalize_whitespace(e['err']), 60)}"
                for e in s["examples"]
            )
            fail_table.add_row(name, str(s["count"]), examples)
        console.print("[red]高频工具错误 (Top 5)[/red]")
        console.print(fail_table)
        console.print()

    err_clusters = compute_error_clusters(analyses)
    if err_clusters:
        cluster_table = Table(show_header=True, header_style="bold")
        cluster_table.add_column("错误类型", width=35)
        cluster_table.add_column("次数", width=8)
        cluster_table.add_column("示例", width=55)
        for key, s in sorted(err_clusters.items(), key=lambda x: -x[1]["count"])[:8]:
            examples = "; ".join(f"step{e[0]}: {e[1]}" for e in s["examples"])
            cluster_table.add_row(truncate(key, 40), str(s["count"]), truncate(examples, 70))
        console.print("[red]错误类型聚类[/red]")
        console.print(cluster_table)
        console.print()

    bash_calls: list[tuple[int, str, ToolCallInfo]] = []
    for a in analyses:
        for tc in a.tool_calls:
            cmd = extract_bash_command(tc)
            if cmd:
                bash_calls.append((a.step_number, cmd, tc))

    if bash_calls:
        bash_durations = [tc.estimated_duration_seconds for _, _, tc in bash_calls if tc.estimated_duration_seconds is not None]
        if bash_durations:
            sorted_dur = sorted(bash_durations)
            total = len(sorted_dur)
            mean = sum(sorted_dur) / total
            p50 = percentile(sorted_dur, 50)
            p90 = percentile(sorted_dur, 90)
            p99 = percentile(sorted_dur, 99)
            buckets = [
                (0, 0.5),
                (0.5, 1),
                (1, 2),
                (2, 5),
                (5, 10),
                (10, 30),
                (30, 60),
                (60, float("inf")),
            ]
            bucket_rows = []
            for lo, hi in buckets:
                label = f">= {lo}s" if hi == float("inf") else f"[{lo}, {hi})s"
                count = len([x for x in sorted_dur if x >= lo and (x < hi if hi != float("inf") else True)])
                pct = count / total * 100
                bucket_rows.append({"label": label, "count": count, "pct": pct})
            max_count = max((r["count"] for r in bucket_rows), default=1)

            console.print("[cyan]Bash 命令耗时分布[/cyan]")
            dist_table = Table(show_header=True, header_style="bold")
            for col in ["count", "min", "p50", "p90", "p99", "mean", "max"]:
                dist_table.add_column(col, width=8)
            dist_table.add_row(
                str(total),
                format_seconds(sorted_dur[0]),
                format_seconds(p50),
                format_seconds(p90),
                format_seconds(p99),
                format_seconds(mean),
                format_seconds(sorted_dur[-1]),
            )
            console.print(dist_table)

            hist_table = Table(show_header=True, header_style="bold")
            hist_table.add_column("区间", width=12)
            hist_table.add_column("count", width=8)
            hist_table.add_column("pct", width=8)
            hist_table.add_column("bar", width=35)
            for r in bucket_rows:
                bar_len = round((r["count"] / max_count) * 30)
                hist_table.add_row(r["label"], str(r["count"]), f"{r['pct']:.1f}%", "█" * bar_len)
            console.print(hist_table)
            console.print()

        cmd_stats: dict[str, dict[str, Any]] = {}
        for step, cmd, tc in bash_calls:
            key = bash_command_key(cmd)
            cur = cmd_stats.setdefault(key, {"calls": 0, "failed": 0, "total_dur": 0, "durations": [], "examples": []})
            cur["calls"] += 1
            if not tc.success:
                cur["failed"] += 1
            if tc.estimated_duration_seconds is not None:
                cur["total_dur"] += tc.estimated_duration_seconds
                cur["durations"].append(tc.estimated_duration_seconds)
            if len(cur["examples"]) < 3:
                cur["examples"].append({"step": step, "cmd": cmd})

        sorted_cmd = sorted(cmd_stats.items(), key=lambda x: x[1]["total_dur"], reverse=True)
        bash_table = Table(show_header=True, header_style="bold")
        bash_table.add_column("总耗时", width=10)
        bash_table.add_column("调用", width=8)
        bash_table.add_column("失败", width=8)
        bash_table.add_column("平均", width=10)
        bash_table.add_column("命令", width=62)
        for key, s in sorted_cmd[: max(top_n, 5)]:
            avg = s["total_dur"] / len(s["durations"]) if s["durations"] else 0
            bash_table.add_row(
                format_seconds(s["total_dur"]),
                str(s["calls"]),
                str(s["failed"]),
                format_seconds(avg),
                truncate(key, 80),
            )
        console.print("[cyan]最耗时的 Bash 命令 (Top 命令)[/cyan]")
        console.print(bash_table)
        console.print()

    by_cmd, by_path = edit_tool_stats(analyses)
    if by_cmd:
        edit_cmd_table = Table(show_header=True, header_style="bold")
        edit_cmd_table.add_column("command", width=18)
        edit_cmd_table.add_column("调用", width=8)
        edit_cmd_table.add_column("成功", width=8)
        for cmd, s in sorted(by_cmd.items(), key=lambda x: -x[1]["total"]):
            edit_cmd_table.add_row(cmd, str(s["total"]), str(s["success"]))
        console.print("[cyan]str_replace_based_edit_tool 按 command[/cyan]")
        console.print(edit_cmd_table)
        console.print()
    if by_path:
        path_table = Table(show_header=True, header_style="bold")
        path_table.add_column("path (Top 10)", width=50)
        path_table.add_column("次数", width=8)
        for path, cnt in sorted(by_path.items(), key=lambda x: -x[1])[:10]:
            path_table.add_row(truncate(path, 55), str(cnt))
        console.print("[cyan]str_replace_based_edit_tool 涉及 path[/cyan]")
        console.print(path_table)
        console.print()

    explore_stats = quick_explore_stats(analyses)
    if explore_stats:
        exp_table = Table(show_header=True, header_style="bold")
        exp_table.add_column("exploration_target", width=50)
        exp_table.add_column("调用", width=8)
        exp_table.add_column("成功", width=8)
        for target, s in sorted(explore_stats.items(), key=lambda x: -x[1]["total"])[:10]:
            exp_table.add_row(truncate(target, 55), str(s["total"]), str(s["success"]))
        console.print("[cyan]quick_explore 统计[/cyan]")
        console.print(exp_table)
        console.print()

    if error_steps:
        err_table = Table(show_header=True, header_style="bold")
        err_table.add_column("步骤", width=8)
        err_table.add_column("错误", width=80)
        for a in error_steps[:10]:
            err_table.add_row(str(a.step_number), truncate(normalize_whitespace(a.error_message or ""), 120))
        console.print("[yellow]错误步骤 (Top 10)[/yellow]")
        console.print(err_table)
        console.print()


# ---------------------------------------------------------------------------
# Output: Replay mode
# ---------------------------------------------------------------------------


def print_replay(traj: TrajectoryFile, verbose: bool = False, fold_ok: bool = False) -> None:
    console.print()
    console.print(box(f"回放: {traj.agent_name} {traj.session_id}", "green"))
    console.print()

    folded = 0
    for a in traj.analyses:
        if fold_ok and not a.has_error:
            folded += 1
            continue
        if fold_ok and folded > 0:
            console.print(f"[dim]  … 已折叠 {folded} 个仅含成功调用的步骤 ───[/dim]")
            folded = 0
        step_dur = f" ({format_seconds(a.duration_seconds)})" if a.duration_seconds is not None else ""
        step_header = f"[dim]─── Step {a.step_number}{step_dur} ───[/dim]"
        if a.has_error:
            step_header = "[red]✗[/red] " + step_header
        console.print(step_header)
        for tc in a.tool_calls:
            status = "[green]OK[/green]" if tc.success else "[red]FAIL[/red]"
            summary = command_summary(tc) or tc.name
            dur_str = f" {format_seconds(tc.estimated_duration_seconds)}" if tc.estimated_duration_seconds is not None else ""
            console.print(f"  {status} [bold]{tc.name}[/bold][dim]{dur_str} {summary}[/dim]")
            if not tc.success and tc.error_message:
                console.print("[red]    " + truncate(normalize_whitespace(tc.error_message), 100) + "[/red]")
            if verbose and tc.result_size is not None:
                console.print(f"[dim]    结果: {tc.result_size} 字符[/dim]")
        console.print()
    if fold_ok and folded > 0:
        console.print(f"[dim]  … 已折叠 {folded} 个仅含成功调用的步骤 ───[/dim]")


# ---------------------------------------------------------------------------
# Output: Insights
# ---------------------------------------------------------------------------


def print_insights(traj: TrajectoryFile) -> None:
    analyses = traj.analyses
    insights: list[str] = []

    tool_counts: dict[str, int] = {}
    fail_counts: dict[str, int] = {}
    for a in analyses:
        for tc in a.tool_calls:
            tool_counts[tc.name] = tool_counts.get(tc.name, 0) + 1
            if not tc.success:
                fail_counts[tc.name] = fail_counts.get(tc.name, 0) + 1

    total_calls = sum(tool_counts.values())
    total_fails = sum(fail_counts.values())
    fail_rate = (total_fails / total_calls * 100) if total_calls else 0

    if fail_rate > 20:
        insights.append(f"工具失败率较高 ({fail_rate:.1f}%)，建议检查工具配置和参数校验")

    sorted_fail = sorted(fail_counts.items(), key=lambda x: x[1], reverse=True)
    top_fail = sorted_fail[0] if sorted_fail else None
    if top_fail and top_fail[1] >= 2:
        insights.append(f'工具 "{top_fail[0]}" 失败次数最多 ({top_fail[1]} 次)，可优先优化')

    bash_calls = [tc for a in analyses for tc in a.tool_calls if tc.name == "bash"]
    if bash_calls:
        bash_fails = sum(1 for tc in bash_calls if not tc.success)
        if bash_fails > 0:
            insights.append(f"Bash 命令执行失败 {bash_fails} 次，建议检查命令语法和环境依赖")
        cmd_key_count: dict[str, int] = {}
        for tc in bash_calls:
            cmd = extract_bash_command(tc)
            if cmd:
                key = bash_command_key(cmd)
                cmd_key_count[key] = cmd_key_count.get(key, 0) + 1
        for key, cnt in cmd_key_count.items():
            if cnt >= 3:
                insights.append(f"同一 Bash 命令执行 {cnt} 次（{truncate(key, 50)}），可考虑缓存或合并")
                break

    edit_calls = [tc for a in analyses for tc in a.tool_calls if tc.name == "str_replace_based_edit_tool"]
    view_range_errors = sum(1 for tc in edit_calls if tc.error_message and "view_range" in tc.error_message)
    if view_range_errors > 0:
        insights.append(f"str_replace_based_edit_tool view 缺少 view_range 参数 {view_range_errors} 次，可改进 prompt 或默认值")

    step_count = len(analyses)
    if step_count > 200:
        insights.append(f"步骤数较多 ({step_count})，可考虑拆分任务或优化探索策略")

    all_durations_excl_human = [
        tc.estimated_duration_seconds
        for a in analyses
        for tc in a.tool_calls
        if not is_human_interaction_tool(tc.name) and tc.estimated_duration_seconds is not None
    ]
    if all_durations_excl_human:
        total_sec_excl = sum(all_durations_excl_human)
        sorted_dur = sorted(all_durations_excl_human, reverse=True)
        top_dur = sorted_dur[0] if sorted_dur else 0
        if top_dur > 60:
            insights.append(f"存在耗时超过 1 分钟的工具调用 (最长 {format_seconds(top_dur)})，可考虑优化或增加超时")
        elif top_dur > 30:
            insights.append(f"存在耗时较长的工具调用 (最长 {format_seconds(top_dur)})，可能含用户等待或可优化")
        bash_durations = [
            tc.estimated_duration_seconds
            for a in analyses
            for tc in a.tool_calls
            if tc.name == "bash" and tc.estimated_duration_seconds is not None
        ]
        if bash_durations and total_sec_excl > 0:
            bash_total = sum(bash_durations)
            pct = f"{bash_total / total_sec_excl * 100:.1f}"
            if float(pct) > 30:
                insights.append(f"Bash 命令占纯Agent耗时 {pct}%，可考虑缓存或优化常用命令")

    if not insights:
        insights.append("未发现明显优化点，轨迹运行较为平稳")

    console.print()
    console.print(box("开发优化洞察", "yellow"))
    console.print()
    for i, text in enumerate(insights, 1):
        console.print(f"  [bold]{i}.[/bold] {text}")
    console.print()


# ---------------------------------------------------------------------------
# Export CSV
# ---------------------------------------------------------------------------


def export_to_csv(traj: TrajectoryFile, output_path: str, full: bool = False) -> None:
    base_cols = ["step", "tool", "success", "duration_sec", "error", "summary"]
    if full:
        base_cols = ["step", "step_duration_sec", "tool_index_in_step", "tool", "call_id", "success", "duration_sec", "result_size", "error", "summary"]
    rows: list[list[str]] = [base_cols]
    for a in traj.analyses:
        step_dur = str(a.duration_seconds) if a.duration_seconds is not None else ""
        for idx, tc in enumerate(a.tool_calls):
            err = (tc.error_message or "").replace('"', '""').replace("\n", " ")
            summary = (command_summary(tc) or "").replace('"', '""').replace("\n", " ")
            if full:
                rows.append(
                    [
                        str(a.step_number),
                        step_dur,
                        str(idx),
                        tc.name,
                        (tc.call_id or "").replace('"', '""'),
                        "1" if tc.success else "0",
                        str(tc.estimated_duration_seconds) if tc.estimated_duration_seconds is not None else "",
                        str(tc.result_size) if tc.result_size is not None else "",
                        err,
                        summary,
                    ]
                )
            else:
                rows.append(
                    [
                        str(a.step_number),
                        tc.name,
                        "1" if tc.success else "0",
                        str(tc.estimated_duration_seconds) if tc.estimated_duration_seconds is not None else "",
                        err,
                        summary,
                    ]
                )
    csv_content = "\n".join(",".join(f'"{c}"' for c in row) for row in rows)
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write("\uFEFF" + csv_content)
    console.print(f"[green]已导出: {output_path}[/green]")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def trajectory_summary_row(traj: TrajectoryFile) -> dict[str, Any]:
    """One-row summary for a trajectory (for --all table and --compare)."""
    analyses = traj.analyses
    total_steps = len(analyses)
    total_calls = sum(a.tool_call_count for a in analyses)
    error_count = sum(1 for a in analyses if a.has_error)
    tool_stats: dict[str, dict[str, Any]] = {}
    for a in analyses:
        for tc in a.tool_calls:
            cur = tool_stats.setdefault(tc.name, {"total": 0, "durations": []})
            cur["total"] += 1
            if tc.estimated_duration_seconds is not None:
                cur["durations"].append(tc.estimated_duration_seconds)
    total_dur = sum(sum(x["durations"]) for x in tool_stats.values())
    return {
        "steps": total_steps,
        "tool_calls": total_calls,
        "errors": error_count,
        "duration_sec": total_dur,
        "agent": traj.agent_name,
    }


def print_all_summary(trajectories: list[TrajectoryFile]) -> None:
    """Print a table with one row per trajectory (for --all)."""
    if not trajectories:
        return
    console.print()
    console.print(box("多轨迹摘要", "cyan"))
    console.print()
    table = Table(show_header=True, header_style="bold")
    table.add_column("文件", width=42)
    table.add_column("Agent", width=18)
    table.add_column("步骤", width=8)
    table.add_column("工具调用", width=10)
    table.add_column("错误步", width=8)
    table.add_column("总耗时", width=10)
    for t in trajectories:
        row = trajectory_summary_row(t)
        table.add_row(
            truncate(t.file_path, 45),
            truncate(t.agent_name, 20),
            str(row["steps"]),
            str(row["tool_calls"]),
            str(row["errors"]),
            format_seconds(row["duration_sec"]) if row["duration_sec"] > 0 else "N/A",
        )
    console.print(table)
    console.print()


def print_compare(traj_a: TrajectoryFile, traj_b: TrajectoryFile) -> None:
    """Side-by-side comparison of two trajectories."""
    ra = trajectory_summary_row(traj_a)
    rb = trajectory_summary_row(traj_b)
    console.print()
    console.print(box("轨迹对比", "cyan"))
    console.print()
    comp = Table(show_header=True, header_style="bold")
    comp.add_column("指标", width=16)
    comp.add_column(truncate(traj_a.file_path, 28), width=32)
    comp.add_column(truncate(traj_b.file_path, 28), width=32)
    comp.add_row("Agent", traj_a.agent_name, traj_b.agent_name)
    comp.add_row("步骤数", str(ra["steps"]), str(rb["steps"]))
    comp.add_row("工具调用数", str(ra["tool_calls"]), str(rb["tool_calls"]))
    comp.add_row("错误步骤", str(ra["errors"]), str(rb["errors"]))
    comp.add_row("总耗时", format_seconds(ra["duration_sec"]) or "N/A", format_seconds(rb["duration_sec"]) or "N/A")
    console.print(comp)
    console.print()


def collect_files(input_path: str) -> list[str]:
    resolved = os.path.abspath(input_path)
    if not os.path.exists(resolved):
        return []
    if os.path.isfile(resolved):
        return [resolved] if resolved.endswith(".json") else []
    files = []
    for name in os.listdir(resolved):
        full = os.path.join(resolved, name)
        if os.path.isfile(full) and TRAJECTORY_FILENAME_RE.match(name):
            files.append(full)
    return sorted(files)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Agent 轨迹分析工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="轨迹 JSON 文件或包含轨迹文件的目录（目录下仅解析 trajectory_<changeID>_<sessionID>_<日期>_<agent>.json）",
    )
    parser.add_argument(
        "path2",
        nargs="?",
        default=None,
        help="第二个轨迹路径（仅 --compare 时使用）",
    )
    parser.add_argument("--all", action="store_true", help="列出目录下所有轨迹的摘要表")
    parser.add_argument("--compare", action="store_true", help="对比两个轨迹文件（需提供 path 与 path2）")
    parser.add_argument("--replay", "-r", action="store_true", help="简洁回放模式")
    parser.add_argument("--top", "-n", type=int, default=20, metavar="N", help="显示 Top N，默认 20")
    parser.add_argument("-o", "--output", metavar="FILE", help="导出 CSV 到指定文件")
    parser.add_argument("--full", action="store_true", help="导出 CSV 时包含 step_duration_sec, call_id, result_size, tool_index_in_step")
    parser.add_argument("--verbose", "-v", action="store_true", help="回放时显示结果字符数")
    parser.add_argument("--replay-fold-ok", action="store_true", help="回放时折叠仅包含成功的步骤，只展开有失败的步骤")
    args = parser.parse_args()

    if args.compare and args.path2:
        resolved_a = str(Path(args.path).resolve() if not Path(args.path).is_absolute() else args.path)
        resolved_b = str(Path(args.path2).resolve() if not Path(args.path2).is_absolute() else args.path2)
        for p in (resolved_a, resolved_b):
            if not os.path.exists(p):
                console.print(f"[red]路径不存在: {p}[/red]")
                raise SystemExit(1)
        ta = load_trajectory(resolved_a)
        tb = load_trajectory(resolved_b)
        if not ta or not tb:
            console.print("[red]至少有一个轨迹无法加载[/red]")
            raise SystemExit(1)
        print_compare(ta, tb)
        return

    search_path = Path(args.path)
    if not search_path.is_absolute():
        search_path = (Path.cwd() / args.path).resolve()
    if not search_path.exists():
        console.print("[red]路径不存在: " + str(search_path) + "[/red]")
        raise SystemExit(1)
    resolved = str(search_path)

    files = collect_files(resolved)
    if not files:
        console.print("[yellow]未找到轨迹文件。请指定一个轨迹 JSON 文件，或包含 trajectory_<changeID>_<sessionID>_<日期>_<agent>.json 的目录。[/yellow]")
        console.print("[dim]示例: python analyze_trajectory.py ./path/to/trajectory_xxx_ses_xxx_20260302_235332_ProposalAgent.json[/dim]")
        raise SystemExit(1)

    trajectories: list[TrajectoryFile] = []
    for f in files:
        t = load_trajectory(f)
        if t:
            trajectories.append(t)

    if not trajectories:
        console.print("[red]没有找到有效的轨迹数据[/red]")
        raise SystemExit(1)

    def sort_key(t: TrajectoryFile) -> float:
        ts = t.file_timestamp
        if hasattr(ts, "timestamp") and callable(ts.timestamp):
            return ts.timestamp()
        return 0.0

    sorted_trajectories = sorted(trajectories, key=sort_key, reverse=True)
    to_analyze = sorted_trajectories[:1]

    if args.all:
        print_all_summary(sorted_trajectories)
        return

    if args.output:
        first = to_analyze[0] if to_analyze else None
        if not first:
            console.print("[red]没有可导出的轨迹数据[/red]")
            raise SystemExit(1)
        export_to_csv(first, args.output, full=args.full)
        return

    for traj in to_analyze:
        if args.replay:
            print_replay(traj, args.verbose, fold_ok=args.replay_fold_ok)
        else:
            print_summary(traj, args.top)
            print_insights(traj)

    if len(trajectories) > 1 and not args.replay:
        console.print(f"[dim]共 {len(trajectories)} 个轨迹文件，仅显示最新 1 个。指定完整路径可分析单个文件。[/dim]")


if __name__ == "__main__":
    main()
