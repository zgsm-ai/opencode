export type LineComment = {
  id: string
  file: string
  selection: import("./file").SelectedLineRange
  comment: string
  time: number
}

type CommentFocus = { file: string; id: string }

const stub = {
  ready: () => true as const,
  list: () => [] as LineComment[],
  all: () => [] as LineComment[],
  add: () => {},
  remove: () => {},
  update: () => {},
  replace: () => {},
  clear: () => {},
  focus: () => null as CommentFocus | null,
  setFocus: () => {},
  clearFocus: () => {},
  active: () => null as CommentFocus | null,
  setActive: () => {},
  clearActive: () => {},
}

export function useComments() {
  return stub
}
