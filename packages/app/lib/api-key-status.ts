/**
 * Server-side only. Returns boolean flags indicating which API keys are configured.
 * Never returns key values — only presence booleans.
 * Import only from Server Components or API route handlers.
 */

export type ApiKeyStatus = {
  present: boolean;
  name: string;
  description: string;
  envVar: string;
  docsUrl: string;
};

export type ApiKeyGroup = {
  group: string;
  keys: ApiKeyStatus[];
};

function isPresent(envVar: string): boolean {
  const value = process.env[envVar];
  return typeof value === 'string' && value.trim().length > 0;
}

export function getApiKeyStatuses(): ApiKeyGroup[] {
  return [
    {
      group: 'AI extraction',
      keys: [
        {
          name: 'Anthropic',
          envVar: 'ANTHROPIC_API_KEY',
          present: isPresent('ANTHROPIC_API_KEY'),
          description:
            'Powers AI field extraction in the intake pipeline. Required for real extraction — without it the pipeline runs in stub mode.',
          docsUrl: 'https://console.anthropic.com/settings/keys'
        },
        {
          name: 'OpenAI',
          envVar: 'OPENAI_API_KEY',
          present: isPresent('OPENAI_API_KEY'),
          description: 'Alternative AI provider for field extraction. Not yet wired — reserved for future provider selection.',
          docsUrl: 'https://platform.openai.com/api-keys'
        },
        {
          name: 'Google Gemini',
          envVar: 'GEMINI_API_KEY',
          present: isPresent('GEMINI_API_KEY'),
          description: 'Alternative AI provider for field extraction. Not yet wired — reserved for future provider selection.',
          docsUrl: 'https://aistudio.google.com/app/apikey'
        }
      ]
    },
    {
      group: 'Search',
      keys: [
        {
          name: 'Brave Search',
          envVar: 'BRAVE_SEARCH_API_KEY',
          present: isPresent('BRAVE_SEARCH_API_KEY'),
          description: 'Used by the mining service for web discovery. Required for Brave-backed source crawling.',
          docsUrl: 'https://api.search.brave.com/app/keys'
        },
        {
          name: 'Google Custom Search — API key',
          envVar: 'GOOGLE_CSE_API_KEY',
          present: isPresent('GOOGLE_CSE_API_KEY'),
          description: 'Used with a Google Custom Search Engine for source discovery.',
          docsUrl: 'https://developers.google.com/custom-search/v1/overview'
        },
        {
          name: 'Google Custom Search — Engine ID',
          envVar: 'GOOGLE_CSE_ID',
          present: isPresent('GOOGLE_CSE_ID'),
          description: 'The CX identifier for your Google Custom Search Engine instance.',
          docsUrl: 'https://programmablesearchengine.google.com/controlpanel/all'
        }
      ]
    },
    {
      group: 'Authentication',
      keys: [
        {
          name: 'Google OAuth — client ID',
          envVar: 'GOOGLE_CLIENT_ID',
          present: isPresent('GOOGLE_CLIENT_ID'),
          description: 'Required for Google sign-in. Set in Google Cloud Console.',
          docsUrl: 'https://console.cloud.google.com/apis/credentials'
        },
        {
          name: 'Google OAuth — client secret',
          envVar: 'GOOGLE_CLIENT_SECRET',
          present: isPresent('GOOGLE_CLIENT_SECRET'),
          description: 'Required alongside the client ID for Google sign-in.',
          docsUrl: 'https://console.cloud.google.com/apis/credentials'
        },
        {
          name: 'NextAuth secret',
          envVar: 'NEXTAUTH_SECRET',
          present: isPresent('NEXTAUTH_SECRET'),
          description: 'Required for session signing. Must be a strong random string.',
          docsUrl: 'https://next-auth.js.org/configuration/options#secret'
        }
      ]
    },
    {
      group: 'Infrastructure',
      keys: [
        {
          name: 'Database URL',
          envVar: 'DATABASE_URL',
          present: isPresent('DATABASE_URL'),
          description: 'Pooled Postgres connection string for the app database.',
          docsUrl: 'https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases/postgresql'
        },
        {
          name: 'Mining import secret',
          envVar: 'MINING_IMPORT_SECRET',
          present: isPresent('MINING_IMPORT_SECRET'),
          description: 'Shared secret authenticating mining service writes to the import API.',
          docsUrl: ''
        }
      ]
    }
  ];
}
