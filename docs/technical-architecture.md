# Echo Technical Architecture

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS

## Backend

- Next.js server routes
- AI provider API
- Database for users, conversations, thoughts, memories, and ideas

## Database

Initial choice:

- Supabase
- PostgreSQL

## Core Data Models

### User

- id
- name
- preferences
- current_focus
- created_at

### Conversation

- id
- user_id
- title
- created_at
- updated_at

### Message

- id
- conversation_id
- role
- content
- created_at

### Thought

- id
- user_id
- content
- status
- created_at

### Memory

- id
- user_id
- category
- content
- importance
- source
- created_at

### Content Idea

- id
- user_id
- title
- concept
- platform
- hook
- status
- created_at

### Daily Briefing

- id
- user_id
- summary
- best_idea_id
- created_at

## Echo v1 Flow

1. User opens Echo.
2. Frontend requests the latest briefing.
3. Backend retrieves relevant thoughts, memories, goals, and analytics.
4. AI generates a personalized response.
5. User continues through text chat.
6. Important information is saved only when appropriate.

## Privacy Boundary

Echo may only use:

- information entered directly into Echo
- information explicitly imported by Sebastian
- information from this dedicated Echo project

Echo must never use unrelated conversations or information belonging to other account users.