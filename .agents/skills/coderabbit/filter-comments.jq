# Filter PR comments to only non-bot comments (user feedback).
# Avoids bash escaping issues with != operator.
[
  .[]
  | select(.user.login | test("coderabbitai|github-actions") | not)
  | {
      author: .user.login,
      body: .body
    }
]
