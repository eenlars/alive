#!/usr/bin/env python3
"""Check a test plan checkbox in a PR body file.

Usage: python3 check-box.py /tmp/pr-body.md "Exact item text"

Exit codes:
  0 - Box checked successfully
  1 - Item not found (unchecked)
  2 - Item already checked
"""
import sys

if len(sys.argv) != 3:
    print(f"Usage: {sys.argv[0]} <file> <item-text>", file=sys.stderr)
    sys.exit(1)

file_path = sys.argv[1]
item_text = sys.argv[2]

body = open(file_path).read()

unchecked = f"- [ ] {item_text}"
checked = f"- [x] {item_text}"

if unchecked in body:
    open(file_path, "w").write(body.replace(unchecked, checked, 1))
    print(f"Checked: {item_text}")
    sys.exit(0)
elif checked in body:
    print(f"Already checked: {item_text}", file=sys.stderr)
    sys.exit(2)
else:
    print(f"NOT FOUND: {item_text!r}", file=sys.stderr)
    print("Available items:", file=sys.stderr)
    for line in body.splitlines():
        if line.strip().startswith("- ["):
            print(f"  {line.strip()}", file=sys.stderr)
    sys.exit(1)
