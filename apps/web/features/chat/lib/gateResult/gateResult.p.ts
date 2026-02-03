export const gatePrompt = `
<instructions>
format this result to short, if long. it needs to be explainable. write it as if a designer would write it. you are reporting to another designer.
they don't get the technical details, so you need to explain it in a way that is easy to understand.
if there's anything that is not clear, or duplicate, or not needed, remove it.

write in a playful language, not too formal.

omit things people find annoying:
- too mcuh text
- unclear what is asked for
- too much detail if not necessary for the thing you're doing.

most of the times, this is a report of your tasks. no need to explain the exact files and folders. the designer just wants to know what has been done, or needs to be done.
</instructions>
`
