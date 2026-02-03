# MCP Best Practices: Code Execution Over Direct Tool Calls

**Source**: Anthropic Article (November 4, 2024)

## Core Principle

Direct tool calls consume context for each definition and result. Agents scale better by writing code to call tools instead.

## The Problem: Token Inefficiency at Scale

As agents connect to hundreds or thousands of MCP tools, two patterns increase cost and latency:

### 1. Tool Definitions Overload Context

Loading all tool definitions upfront bloats context. Each tool definition occupies significant space:

```
gdrive.getDocument
  Description: Retrieves a document from Google Drive
  Parameters:
    documentId (required, string): The ID of the document to retrieve
    fields (optional, string): Specific fields to return
  Returns: Document object with title, body content, metadata, permissions, etc.
```

With thousands of tools, you process hundreds of thousands of tokens before reading a request.

### 2. Intermediate Results Consume Tokens

Direct tool calls pass all results through model context:

```
TOOL CALL: gdrive.getDocument(documentId: "abc123")
  → returns "Discussed Q4 goals...\n[full transcript text]"
     (loaded into context)

TOOL CALL: salesforce.updateRecord(
  objectType: "SalesMeeting",
  recordId: "00Q5f000001abcXYZ",
  data: { "Notes": "Discussed Q4 goals...\n[full transcript text]" }
)
  (transcript written into context again)
```

A 2-hour meeting transcript flows through twice, adding 50,000+ tokens. Large documents may exceed context limits entirely.

## The Solution: Present MCP as Code APIs

Generate a file tree of available tools:

```
servers/
├── google-drive/
│   ├── getDocument.ts
│   ├── ... (other tools)
│   └── index.ts
├── salesforce/
│   ├── updateRecord.ts
│   ├── ... (other tools)
│   └── index.ts
└── ... (other servers)
```

Each tool is a typed function:

```typescript
// ./servers/google-drive/getDocument.ts
import { callMCPTool } from "../../../client.js";

interface GetDocumentInput {
  documentId: string;
}

interface GetDocumentResponse {
  content: string;
}

/* Read a document from Google Drive */
export async function getDocument(input: GetDocumentInput): Promise<GetDocumentResponse> {
  return callMCPTool<GetDocumentResponse>('google_drive__get_document', input);
}
```

Agents write code instead of making direct tool calls:

```typescript
// Read transcript from Google Docs and add to Salesforce prospect
import * as gdrive from './servers/google-drive';
import * as salesforce from './servers/salesforce';

const transcript = (await gdrive.getDocument({ documentId: 'abc123' })).content;
await salesforce.updateRecord({
  objectType: 'SalesMeeting',
  recordId: '00Q5f000001abcXYZ',
  data: { Notes: transcript }
});
```

**Result**: Token usage drops from 150,000 to 2,000—a 98.7% reduction.

## Key Benefits

### Progressive Disclosure

Agents discover tools by exploring filesystem or searching:

```typescript
// Load only needed tool definitions on-demand
const salesforceTools = await searchTools('salesforce');
```

Alternatives: Search with detail levels (name only, name + description, full schema).

### Context-Efficient Results

Filter and transform data in execution environment before returning to model:

```typescript
// Without code: all 10,000 rows flow through context
TOOL CALL: gdrive.getSheet(sheetId: 'abc123')
  → returns 10,000 rows to filter manually

// With code: filter before returning
const allRows = await gdrive.getSheet({ sheetId: 'abc123' });
const pendingOrders = allRows.filter(row => row["Status"] === 'pending');
console.log(`Found ${pendingOrders.length} pending orders`);
console.log(pendingOrders.slice(0, 5)); // Only log first 5
```

Agent sees 5 rows instead of 10,000.

### Powerful Control Flow

Loops, conditionals, error handling use standard code patterns:

```typescript
// Poll for deployment notification
let found = false;
while (!found) {
  const messages = await slack.getChannelHistory({ channel: 'C123456' });
  found = messages.some(m => m.text.includes('deployment complete'));
  if (!found) await new Promise(r => setTimeout(r, 5000));
}
console.log('Deployment notification received');
```

More efficient than alternating tool calls with sleep commands through agent loop.

### Privacy-Preserving Operations

Intermediate results stay in execution environment. Agent only sees explicitly logged data.

For sensitive workloads, tokenize PII automatically:

```typescript
// Agent writes this code
const sheet = await gdrive.getSheet({ sheetId: 'abc123' });
for (const row of sheet.rows) {
  await salesforce.updateRecord({
    objectType: 'Lead',
    recordId: row.salesforceId,
    data: {
      Email: row.email,
      Phone: row.phone,
      Name: row.name
    }
  });
}

// What agent sees if logging sheet.rows:
[
  { salesforceId: '00Q...', email: '[EMAIL_1]', phone: '[PHONE_1]', name: '[NAME_1]' },
  { salesforceId: '00Q...', email: '[EMAIL_2]', phone: '[PHONE_2]', name: '[NAME_2]' }
]
```

Real data flows from Sheets to Salesforce without passing through model. Define deterministic security rules for data flow.

### State Persistence & Skills

Agents maintain state across operations:

```typescript
// Save intermediate results
const leads = await salesforce.query({
  query: 'SELECT Id, Email FROM Lead LIMIT 1000'
});
const csvData = leads.map(l => `${l.Id},${l.Email}`).join('\n');
await fs.writeFile('./workspace/leads.csv', csvData);

// Later execution resumes
const saved = await fs.readFile('./workspace/leads.csv', 'utf-8');
```

Agents build reusable skills:

```typescript
// Save working code as skill
// In ./skills/save-sheet-as-csv.ts
import * as gdrive from './servers/google-drive';

export async function saveSheetAsCsv(sheetId: string) {
  const data = await gdrive.getSheet({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  await fs.writeFile(`./workspace/sheet-${sheetId}.csv`, csv);
  return `./workspace/sheet-${sheetId}.csv`;
}

// Later, reuse skill
import { saveSheetAsCsv } from './skills/save-sheet-as-csv';
const csvPath = await saveSheetAsCsv('abc123');
```

Add SKILL.md files for structured skill documentation. Over time, agents build toolboxes of higher-level capabilities.

## Trade-offs

Code execution requires:
- Secure execution environment with sandboxing
- Resource limits and monitoring
- Infrastructure overhead vs. direct tool calls

Weigh reduced token costs and latency against implementation complexity.

## References

- Cloudflare published similar findings ("Code Mode")
- Core insight: LLMs excel at writing code; leverage this strength for efficient MCP interaction
