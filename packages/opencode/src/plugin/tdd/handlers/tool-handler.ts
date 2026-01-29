import { list_user_commands } from "../tools/list-user-commands.tool"
import { LIST_USER_COMMANDS_TOOL_NAME } from "../tools/constants"

export function getTools() {
  return {
    [LIST_USER_COMMANDS_TOOL_NAME]: list_user_commands,
  }
}
