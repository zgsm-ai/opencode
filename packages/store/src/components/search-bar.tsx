export default function SearchBar(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div class="relative">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-weak text-sm">⌕</span>
      <input
        type="text"
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        placeholder={props.placeholder ?? "Search..."}
        class="w-full pl-8 pr-3 py-2 text-sm border border-border-weak-base rounded-md bg-bg-base text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-1 focus:ring-border-weak-base"
      />
    </div>
  )
}
