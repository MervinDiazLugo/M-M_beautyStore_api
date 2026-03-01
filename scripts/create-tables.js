// scripts/create-tables.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTables() {
  console.log('Creating products table...');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT,
        price NUMERIC,
        description TEXT,
        image TEXT,
        category TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });

  if (error) {
    console.log('RPC error:', error.message);
    console.log('\nTrying alternative method via REST API...');
    
    // Alternative: use the management API via fetch
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        id: 'test-table',
        title: 'test'
      })
    });
    
    console.log('Response:', response.status, response.statusText);
  } else {
    console.log('Table created successfully!');
  }
}

createTables();
