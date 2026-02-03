/**
 * Test automation with a simple prompt
 */
import { createAppClient } from '@webalive/database';
import { runAutomationJob } from '../apps/web/lib/automation/executor';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = createAppClient(url, key);

// Get job info
const jobId = 'auto_job_a32f0f84b872ad29';
const {data: job} = await client.from('automation_jobs').select('*').eq('id', jobId).single();
const {data: site} = await client.from('domains').select('*').eq('domain_id', job!.site_id).single();

if (!site?.hostname) {
  console.error('Site not found');
  process.exit(1);
}

console.log('=== Testing Automation with Simple Prompt ===');
console.log('Site:', site.hostname);

// Use a very simple prompt that should complete quickly
const testPrompt = 'Say hello and confirm you can access the workspace. List the files in the current directory.';

console.log('Prompt:', testPrompt);
console.log('\nTriggering...\n');

const result = await runAutomationJob({
  jobId: 'test-' + Date.now(), // Fake job ID to avoid DB updates
  userId: job!.user_id,
  orgId: job!.org_id,
  workspace: site.hostname,
  prompt: testPrompt,
  timeoutSeconds: 120,
});

console.log('\n=== Result ===');
console.log('Success:', result.success);
console.log('Duration:', result.durationMs, 'ms');
if (result.error) {
  console.log('Error:', result.error);
}
if (result.response) {
  console.log('Response:', result.response.substring(0, 1000), result.response.length > 1000 ? '...' : '');
}
