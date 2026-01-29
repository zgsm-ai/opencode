import { Command } from "../../../command"
import TEST_TEMPLATE from "./template/test.txt"

export async function getCommands(): Promise<Record<string, Command.Info>> {
  return {
    test: {
      name: "test",
      description:
        "execute comprehensive testing workflow: confirm requirements, generate test cases, and execute tests with automated fixes",
      template: TEST_TEMPLATE,
      hints: Command.hints(TEST_TEMPLATE),
    },
  }
}
