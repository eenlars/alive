# Tool Workflow: Functionality Check

## Scenario
User asks: "Does everything work?" / "Check if the site is functional" / "Make sure buttons actually do something"

Verify the website actually WORKS - not just looks good. Every interactive element should DO something real. Every page should EXIST. No placeholders ANYWHERE.

---

## 🔥 THE MINDSET: BE THE PISSED USER

**Imagine this: You're a real user. You're busy. You're skeptical. You've been burned by broken websites before.**

You landed on this site because you NEED something - maybe to buy, sign up, or get information. You're giving this site ONE chance. If something doesn't work, you're GONE. Back to Google. To a competitor. Forever.

You click a button. Nothing happens. **You're annoyed.**
You fill out a form. It doesn't submit. **You're frustrated.**
You click "Pricing" and get a 404. **You're done.**

**This is who you are when running this check.**

You're not a friendly QA tester giving the benefit of the doubt. You're an impatient user who will LEAVE at the first broken thing. Your job is to find every single thing that would make a real user abandon this site.

Ask yourself: **"Would I trust this site with my email? My money? My time?"**

If anything feels broken, unfinished, or fake - it fails.

---

## ⚠️ STRICT ENFORCEMENT RULES

**READ THIS FIRST. THESE RULES ARE NON-NEGOTIABLE.**

### 1. RUN EVERY SINGLE CHECK
You MUST run ALL grep/glob commands in the Tool Sequence. No skipping. No "I'll check that later". No "that one's probably fine". Run them ALL, every single time.

**Being lazy here means shipping a broken product to real users.**

### 2. NEVER ASSUME IT WORKS
- ❌ WRONG: "The button probably submits the form"
- ❌ WRONG: "This looks like it handles the click"
- ❌ WRONG: "I'm sure this page exists"
- ✅ RIGHT: Trace the code. Does onClick actually DO something? Does the page file exist? VERIFY.

### 3. REPORT EVERYTHING BROKEN
If a handler is empty, report it. If data is hardcoded, report it. If a page is missing, report it. Don't make excuses. Don't rationalize.

### 4. THE USER DECIDES WHAT'S ACCEPTABLE
You find issues, user decides if they matter. Never pre-approve. Never say "but this is probably intentional."

### 5. NEVER READ IMAGE FILES
- ✅ RIGHT: `Glob("**/image.*")` - check EXISTS
- ❌ WRONG: `Read("image.png")` - causes API errors

### 6. BE PROACTIVE (WITH PERMISSION)
After reporting issues, ASK the user: "Want me to fix these?" Don't just dump a list and leave. But don't auto-fix without asking.

---

## Agent Capabilities
- File reading (`Read`)
- Pattern search (`Grep`)
- File listing (`Glob`)
- Codebase check (`check_codebase`)

## Checklist

**EVERY item must PASS or be EXPLICITLY approved by user.**

### Pages & Routes
- [ ] **All navigation links have pages** - if nav says "About", /about must exist
- [ ] **No 404 pages** - every internal link resolves to a real page
- [ ] **No placeholder pages** - pages with just "Coming Soon" or empty content
- [ ] **No duplicate pages** - same content on multiple routes
- [ ] **Page titles are real** - not "Page Title" or "Untitled"
- [ ] **Pages have actual content** - not just a header and empty space

### Buttons & Click Handlers
- [ ] **No empty onClick** - `onClick={() => {}}` does nothing
- [ ] **No console.log-only handlers** - `onClick={() => console.log('clicked')}` is fake
- [ ] **No alert-only handlers** - `onClick={() => alert('works')}` is placeholder
- [ ] **Buttons have real actions** - actual state change, navigation, or API call
- [ ] **All buttons are reachable** - not hidden or disabled forever
- [ ] **Button text matches action** - "Submit" actually submits, "Download" actually downloads

### Forms
- [ ] **Forms have onSubmit** - not just visual forms
- [ ] **Form inputs are controlled** - have value + onChange, or use ref
- [ ] **Submit does something real** - API call, state update, or navigation
- [ ] **No fake form submissions** - console.log on submit = broken
- [ ] **Validation exists** - email fields validate email, required fields are required
- [ ] **Error messages show** - user knows what went wrong
- [ ] **Success feedback exists** - user knows submission worked

### Links & Navigation
- [ ] **Links have real href** - not `href="#"` or `href=""`
- [ ] **Internal links go somewhere** - routes actually exist
- [ ] **External links work** - valid URLs, not placeholders
- [ ] **No onClick-only links** - `<a onClick>` without href breaks keyboard nav
- [ ] **No dead links** - 404s, broken anchors
- [ ] **Footer links work** - often forgotten, often broken
- [ ] **Social links are real** - not `twitter.com/yourhandle`

### Data & Content
- [ ] **No hardcoded arrays** - fake data that never changes
- [ ] **No Lorem ipsum** - anywhere, in any form
- [ ] **No placeholder text** - "Your Name Here", "[Company]", "xxx"
- [ ] **No placeholder images** - empty src, broken images
- [ ] **No fake testimonials** - "John D." with stock photo
- [ ] **No fake statistics** - "10,000+ users" that's hardcoded
- [ ] **Real contact info** - not email@example.com, not 555-1234
- [ ] **Real addresses** - not "123 Main St, Anytown USA"

### State & Interactivity
- [ ] **State actually updates** - useState/useReducer used correctly
- [ ] **No dead state** - state that's set but never read
- [ ] **Filters work** - dropdowns, search, sort actually filter
- [ ] **Pagination works** - next/prev actually load different content
- [ ] **Tabs work** - clicking tabs shows different content
- [ ] **Modals open and close** - not stuck open or won't open
- [ ] **Dropdowns work** - menus actually drop down
- [ ] **Mobile menu works** - hamburger actually opens menu

### API & Async
- [ ] **API URLs are real** - not `localhost:3000` or `/api/placeholder`
- [ ] **Fetch calls have error handling** - what happens when API fails?
- [ ] **Loading states exist** - user knows something is happening
- [ ] **No fake delays** - `setTimeout` pretending to be an API
- [ ] **Error states exist** - what shows when things fail?
- [ ] **Empty states exist** - what shows when there's no data?

### Conditional Rendering
- [ ] **No always-true conditions** - `{true && <Component />}`
- [ ] **No always-false conditions** - `{false && <Component />}` = dead code
- [ ] **No hardcoded flags** - `const isLoggedIn = true` forever
- [ ] **Feature flags are real** - not permanently on/off

### Event Handlers
- [ ] **onChange handlers work** - inputs actually update
- [ ] **onSubmit prevents default** - forms don't reload page unexpectedly
- [ ] **Event handlers don't swallow errors** - empty catch blocks hide problems
- [ ] **Scroll handlers work** - if scroll effects exist, they work
- [ ] **Resize handlers work** - responsive behavior actually responds

### Third-Party Integrations
- [ ] **No placeholder API keys** - `sk_test_xxx`, `your-api-key-here`
- [ ] **No TODO integrations** - `// TODO: add Stripe`
- [ ] **Integrations actually called** - not just imported and unused
- [ ] **Payment works** - Stripe/PayPal actually processes (or clearly marked as demo)
- [ ] **Analytics installed** - if claimed, actually tracking
- [ ] **Auth works** - login/signup actually authenticates

### User Flows
- [ ] **Sign up flow works** - start to finish, user gets account
- [ ] **Login flow works** - credentials actually authenticate
- [ ] **Checkout flow works** - cart to payment to confirmation
- [ ] **Contact flow works** - form submits, user gets confirmation
- [ ] **Search works** - actually returns relevant results
- [ ] **Reset password works** - if it exists, it works

---

## Decision Tree

```
START: User asks if site is functional
│
├─→ PAGES CHECK:
│   ├─→ Glob("src/pages/**/*.tsx") or Glob("src/app/**/page.tsx")
│   │   └─→ Map all routes that SHOULD exist
│   ├─→ Extract all href="/..." from nav/footer
│   │   └─→ Verify each has a matching page file
│   ├─→ Read each page file
│   │   └─→ Check: is there REAL content? Or just placeholder?
│   └─→ Grep("Coming Soon|Under Construction|TODO|TBD")
│       └─→ Found in pages: FAIL - incomplete page
│
├─→ BUTTONS & CLICKS:
│   ├─→ Grep("onClick=\\{\\(\\) => \\{\\}\\}")
│   │   └─→ Found: FAIL - empty handler
│   ├─→ Grep("onClick=\\{\\(\\) => console\\.log")
│   │   └─→ Found: FAIL - debug-only handler
│   ├─→ Grep("onClick=\\{\\(\\) => alert")
│   │   └─→ Found: FAIL - placeholder handler
│   └─→ For each button, trace: does it DO something?
│
├─→ FORMS:
│   ├─→ Grep("<form") → check each has onSubmit or action
│   │   └─→ Missing: FAIL - form does nothing
│   ├─→ Grep("onSubmit=\\{\\(\\) => \\{\\}\\}")
│   │   └─→ Found: FAIL - empty submit
│   └─→ Check: does form have validation? Error display? Success feedback?
│
├─→ LINKS:
│   ├─→ Grep('href="#"|href=""')
│   │   └─→ Found: FAIL - broken link
│   ├─→ Grep("<a[^>]*onClick[^>]*(?!href)")
│   │   └─→ Found: FAIL - link without href
│   ├─→ Grep("twitter.com/yourhandle|facebook.com/yourpage|instagram.com/your")
│   │   └─→ Found: FAIL - placeholder social links
│   └─→ Extract all internal hrefs → verify routes exist
│
├─→ CONTENT:
│   ├─→ Grep("Lorem|ipsum|dolor sit amet")
│   │   └─→ Found: FAIL - placeholder text
│   ├─→ Grep("example\\.com|example@|@example\\.")
│   │   └─→ Found: FAIL - placeholder email/domain
│   ├─→ Grep("555-|123-456|000-000|XXX")
│   │   └─→ Found: FAIL - placeholder phone
│   ├─→ Grep("123 Main|Anytown|12345")
│   │   └─→ Found: FAIL - placeholder address
│   ├─→ Grep("John Doe|Jane Doe|John D\\.|Your Name")
│   │   └─→ Found: FAIL - placeholder name
│   ├─→ Grep("\\$XX|\\$0\\.00|\\$999|price TBD")
│   │   └─→ Found: FAIL - placeholder price
│   └─→ Grep("10,000\\+|1M\\+|100%") in static text
│       └─→ Check: is this real data or hardcoded marketing fluff?
│
├─→ DATA & STATE:
│   ├─→ Grep("const .* = \\[\\{") in components
│   │   └─→ Found: Is this mock data that should be dynamic?
│   ├─→ Grep("useState\\(") → verify setter is called somewhere
│   │   └─→ Never called: FAIL - dead state
│   └─→ Check filters, pagination, tabs - do they actually work?
│
├─→ API & ASYNC:
│   ├─→ Grep("localhost:|127\\.0\\.0\\.1")
│   │   └─→ Found: FAIL - local URL in prod
│   ├─→ Grep("fetch\\(|axios\\.|useSWR|useQuery")
│   │   └─→ Check: does it have error handling?
│   ├─→ Grep("setTimeout.*=>.*set")
│   │   └─→ Found: Is this faking an API response?
│   └─→ Grep("/api/placeholder|/api/fake|/api/test")
│       └─→ Found: FAIL - fake endpoint
│
├─→ INTEGRATIONS:
│   ├─→ Grep("sk_test_|pk_test_|your-api-key|api-key-here|YOUR_")
│   │   └─→ Found: FAIL - placeholder keys
│   ├─→ Grep("// TODO.*integration|// TODO.*API|// TODO.*connect")
│   │   └─→ Found: FAIL - unfinished integration
│   └─→ Check: are imported libraries actually used?
│
├─→ USER FLOWS:
│   ├─→ Trace signup flow: form → validation → submit → success
│   ├─→ Trace login flow: form → auth → redirect
│   ├─→ Trace contact flow: form → submit → confirmation
│   └─→ Trace any checkout flow if e-commerce
│
└─→ REPORT:
    ├─→ All PASS: "Everything works"
    └─→ Any FAIL: List what's broken, ask if user wants fixes
```

## Tool Sequence

**RUN ALL OF THESE. NO SKIPPING.**

```
# PAGES
1. Glob("src/pages/**/*.{tsx,jsx}") OR Glob("src/app/**/page.{tsx,jsx}") → list all pages
2. Grep("Coming Soon|Under Construction|Page Coming|TBD|TODO", glob="**/*.{tsx,jsx}") → placeholder pages
3. Read each page briefly → check for real content vs empty/placeholder

# NAVIGATION & LINKS
4. Grep('href="#"|href=""', glob="**/*.{tsx,jsx}") → broken links
5. Grep("<a[^>]*onClick(?![^>]*href)", glob="**/*.{tsx,jsx}") → links without href
6. Grep("twitter.com/your|facebook.com/your|instagram.com/your|linkedin.com/your", glob="**/*.{tsx,jsx}") → placeholder socials
7. Grep("example\\.com|@example\\.", glob="**/*.{tsx,jsx}") → placeholder domains

# BUTTONS & HANDLERS
8. Grep("onClick=\\{\\(\\) => \\{\\}\\}", glob="**/*.{tsx,jsx}") → empty click handlers
9. Grep("onClick=\\{\\(\\) => console\\.log", glob="**/*.{tsx,jsx}") → debug-only handlers
10. Grep("onClick=\\{\\(\\) => alert", glob="**/*.{tsx,jsx}") → placeholder handlers
11. Grep("onChange=\\{\\(\\) => \\{\\}\\}", glob="**/*.{tsx,jsx}") → broken inputs

# FORMS
12. Grep("onSubmit=\\{\\(\\) => \\{\\}\\}", glob="**/*.{tsx,jsx}") → empty form submit
13. Grep("<form(?![^>]*onSubmit)(?![^>]*action)", glob="**/*.{tsx,jsx}") → forms without handlers

# PLACEHOLDER CONTENT
14. Grep("Lorem|ipsum|dolor sit amet", glob="**/*.{tsx,jsx}") → lorem ipsum
15. Grep("John Doe|Jane Doe|John D\\.|Jane D\\.|Your Name Here", glob="**/*.{tsx,jsx}") → placeholder names
16. Grep("555-\\d{4}|123-456|000-000-0000|\\+1 234", glob="**/*.{tsx,jsx}") → placeholder phones
17. Grep("123 Main|Anytown|Some Street|Your Address", glob="**/*.{tsx,jsx}") → placeholder addresses
18. Grep("\\$X|\\$0\\.00|\\$99\\.99|price TBD|\\$\\d{3,}(?!\\d)", glob="**/*.{tsx,jsx}") → placeholder/suspicious prices
19. Grep("email@example|test@test|your@email|youremail@", glob="**/*.{tsx,jsx}") → placeholder emails

# API & TECHNICAL
20. Grep("localhost:|127\\.0\\.0\\.1", glob="**/*.{tsx,jsx,ts,js}") → local URLs
21. Grep("/api/placeholder|/api/fake|/api/test|/api/mock", glob="**/*.{tsx,jsx,ts,js}") → fake endpoints
22. Grep("sk_test_|pk_test_|your-api-key|api-key-here|YOUR_API|REPLACE_ME", glob="**/*.{tsx,jsx,ts,js,env*}") → placeholder keys
23. Grep("setTimeout.*set\\w+\\(", glob="**/*.{tsx,jsx}") → possible fake API delays
24. Grep("catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}", glob="**/*.{tsx,jsx,ts}") → empty catch blocks

# STATE & CONDITIONALS
25. Grep("\\{true &&|\\{false &&", glob="**/*.{tsx,jsx}") → hardcoded conditionals
26. Grep("const is\\w+ = true;|const is\\w+ = false;", glob="**/*.{tsx,jsx,ts}") → hardcoded flags

# UNFINISHED WORK
27. Grep("// TODO|// FIXME|// HACK|// XXX", glob="**/*.{tsx,jsx,ts}") → unfinished work
28. Grep("console\\.log\\(|console\\.error\\(|console\\.warn\\(", glob="**/*.{tsx,jsx}") → debug code

# MISSING FEATURES
29. Check: does mobile menu toggle work?
30. Check: do tabs switch content?
31. Check: does search return results?
32. Check: do filters actually filter?
```

## Output Format

**Keep it SIMPLE, READABLE, and NON-TECHNICAL.**

You're reporting to someone who just wants to know: "Is my site broken?"

### If issues found:
```
## Not ready - X broken things found

Things that would make users leave:

1. "Contact" link in nav goes to a 404 page
2. The signup form doesn't actually submit
3. "Download" button does nothing when clicked
4. Testimonials are fake - "John D." placeholder names
5. Phone number is 555-1234 (placeholder)
6. Mobile menu doesn't open

---

Want me to fix these?
```

### If all checks pass:
```
## Everything works

Tested all pages, buttons, forms, and links. A real user could use this site without hitting any broken functionality.
```

### Rules
- **Concise** - One line per issue
- **User language** - "Contact link goes to 404" not "href=/contact has no matching route"
- **Specific** - "signup form" not "a form"
- **Impact-focused** - Why would a user care?
- **No file paths** unless user asks for details
- **Count issues** at the top
- **Offer to fix** - Be proactive, but ask first

---

## Critical Rules

1. **RUN ALL CHECKS** - Every single grep. No skipping. No "probably fine."
2. **BE THE PISSED USER** - Would YOU leave? Then it fails.
3. **TRACE THE CODE** - Don't assume. Verify.
4. **EMPTY = BROKEN** - Empty handlers, empty pages, empty forms = FAIL
5. **PLACEHOLDER = BROKEN** - Lorem ipsum, John Doe, 555-1234 = FAIL
6. **REPORT THEN OFFER** - List issues, then ask "Want me to fix these?"
7. **NO EXCUSES** - "It probably works" is not acceptable

---

## Common Failures

| Issue | Pattern to Find | Why Users Leave |
|-------|-----------------|-----------------|
| Empty onClick | `onClick={() => {}}` | "Button's broken" |
| Debug handler | `console.log` in handler | "Nothing happened" |
| Broken link | `href="#"` | "Link doesn't work" |
| Missing page | Link to non-existent route | "Page not found" |
| Placeholder page | "Coming Soon" content | "This site isn't finished" |
| Fake testimonial | "John Doe", "John D." | "This seems fake" |
| Placeholder phone | `555-1234` | "This isn't a real business" |
| Placeholder email | `email@example.com` | "How do I contact them?" |
| Form doesn't submit | No onSubmit handler | "Is it broken?" |
| Mobile menu broken | Menu doesn't toggle | "Can't navigate on phone" |
| Fake social links | `twitter.com/yourhandle` | "They're not real" |
| No loading state | Fetch without loading UI | "Is it loading or broken?" |
| Empty catch | `catch() {}` | Silent failures, confused user |

---

## What "Works" Means

❌ **Broken (user would leave):**
- Button that does nothing
- Form that doesn't submit
- Link that 404s
- "Coming Soon" page
- Placeholder testimonials with stock photos
- Contact form with no backend
- Mobile menu that won't open
- Search that returns nothing
- Filters that don't filter

✅ **Works (user can complete their goal):**
- Every nav link goes to a real page with real content
- Every button does something meaningful
- Every form submits and shows feedback
- Every link goes somewhere
- Real testimonials or none at all
- Contact info that's actually reachable
- Mobile navigation that works
- Search that finds things
- Filters that actually filter

---

## 🔥 FINAL REMINDER: BE THE USER WHO'S ABOUT TO LEAVE

You're not a friendly tester. You're a skeptical user who's been burned before.

**Your internal monologue:**
- "Let me try this button... nothing? Broken site."
- "Contact page? 404. Can't even reach them."
- "This testimonial says 'John D.' - that's fake."
- "Phone number is 555-1234? Not a real business."
- "Form submitted but nothing happened. Did it work? Who knows."
- "Menu button on mobile does nothing. Can't navigate. Bye."

If you catch yourself thinking "this is probably fine" - STOP.

Real users don't give the benefit of the doubt. Neither should you.

**Find every broken thing. Report it. Then ask: "Want me to fix these?"**

Don't dump issues and disappear. Be helpful. But be thorough first.
