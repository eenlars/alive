# Filter CodeRabbit GraphQL response to only unresolved threads.
# Strips verbose sections from comment bodies to save context tokens.
[
  .data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved == false)
  | select(.comments.nodes[0].author.login == "coderabbitai")
  | {
      threadId: .id,
      file: .comments.nodes[0].path,
      line: .comments.nodes[0].line,
      commentId: .comments.nodes[0].databaseId,
      body: (
        .comments.nodes[0].body
        | gsub("<!-- .*? -->"; "")
        | gsub("<!-- [\\s\\S]*?-->"; "")
        | gsub("<details>\\s*<summary>🤖 Prompt for AI Agents</summary>[\\s\\S]*?</details>"; "")
        | gsub("<details>\\s*<summary>🧠 Learnings used</summary>[\\s\\S]*?</details>"; "")
        | gsub("<details>\\s*<summary>🧩 Analysis chain</summary>[\\s\\S]*?</details>"; "")
        | gsub("\\n{3,}"; "\n\n")
      )
    }
]
