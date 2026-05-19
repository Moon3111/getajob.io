#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse .env.local manually
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  });
  return env;
}

const env = parseEnvFile(path.join(__dirname, '.env.local'));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function applyMigration() {
  console.log('📋 Reading migration file...');
  
  // Read the migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '006_hybrid_matching_pagination.sql');
  let sql = fs.readFileSync(migrationPath, 'utf-8');
  
  console.log('🔄 Connecting to Supabase...');
  console.log(`   URL: ${supabaseUrl}`);
  
  try {
    // Use the Supabase SQL API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'X-Client-Info': 'migration-script',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query: sql
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    console.log('✓ Migration applied successfully!');
    console.log('\n✓ Column manual_top_keywords added to user_profiles');
    console.log('✓ Function match_jobs_hybrid created');
    console.log('✓ Function match_jobs_hybrid_single created');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.log('\n📝 Please apply the migration manually:');
    console.log('1. Go to https://app.supabase.com/project/smralahxzqahafkmsvcw');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query and paste the contents of:');
    console.log('   supabase/migrations/006_hybrid_matching_pagination.sql');
    console.log('4. Execute the query');
    console.log('\nAlternatively, use the Supabase CLI:');
    console.log('   supabase migration up');
    process.exit(1);
  }
}

applyMigration().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
