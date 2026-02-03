/**
 * Fake Linear data for previews and testing
 *
 * Shared between component tests and preview-ui.
 */

export const FAKE_LINEAR_ISSUE = {
  id: "issue-1",
  identifier: "ENG-123",
  title: "Implement dark mode toggle in settings panel",
  description:
    "Add a toggle switch in the settings panel that allows users to switch between light and dark themes. The preference should persist across sessions.",
  priority: { value: 2, name: "High" },
  status: "In Progress",
  url: "https://linear.app/team/issue/ENG-123",
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  project: "UI Improvements",
  team: "Engineering",
  assignee: "John Doe",
}

export const FAKE_LINEAR_ISSUES = [
  FAKE_LINEAR_ISSUE,
  {
    id: "issue-2",
    identifier: "ENG-124",
    title: "Fix authentication flow redirect loop",
    description: "Users are experiencing redirect loops when logging in.",
    priority: { value: 1, name: "Urgent" },
    status: "In Review",
    url: "https://linear.app/team/issue/ENG-124",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    project: "Auth",
    assignee: "Jane Smith",
  },
  {
    id: "issue-3",
    identifier: "ENG-125",
    title: "Add pagination to API endpoints",
    priority: { value: 3, name: "Medium" },
    status: "Todo",
    url: "https://linear.app/team/issue/ENG-125",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    project: "API",
  },
  {
    id: "issue-4",
    identifier: "ENG-126",
    title: "Update dependency versions for security patches",
    priority: { value: 4, name: "Low" },
    status: "Backlog",
    url: "https://linear.app/team/issue/ENG-126",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "issue-5",
    identifier: "ENG-120",
    title: "Refactor database connection pooling",
    description: "Completed last sprint.",
    priority: { value: 2, name: "High" },
    status: "Done",
    url: "https://linear.app/team/issue/ENG-120",
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    project: "Infrastructure",
    assignee: "Alex Johnson",
  },
]

export const FAKE_LINEAR_COMMENT = {
  id: "comment-1",
  body: "This looks great! Just a few suggestions:\n\n- Consider adding a transition animation\n- Make sure it works on mobile\n- Add keyboard shortcut support",
  user: { id: "user-1", name: "Jane Smith", email: "jane@example.com" },
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  issue: { id: "issue-1", identifier: "ENG-123", title: "Implement dark mode" },
}

export const FAKE_LINEAR_COMMENTS = [
  FAKE_LINEAR_COMMENT,
  {
    id: "comment-2",
    body: "Agreed, the transition should be smooth. I'd suggest using 200ms ease-out.",
    user: { id: "user-2", name: "John Doe" },
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "comment-3",
    body: "I've added the keyboard shortcut. Press Cmd+D to toggle.",
    user: { id: "user-3", name: "Alex Johnson" },
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
]
