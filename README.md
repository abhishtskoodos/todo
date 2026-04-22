# Firebase Task & Workflow Management System

This app is a real-time collaborative task management system designed for production-like workflows.

## Features

- Email/password authentication with Firebase Auth.
- Firestore-backed task model with scalable structure.
- Kanban board with drag-and-drop status transitions.
- Real-time updates across board, detail panel, and table view.
- Task detail tabs: description, steps, conversations, and activity logs.
- Step progression and computed task `stepProgress`.
- Mention extraction in conversations (`@user`).
- Lazy loading and pagination per status column using `limit + startAfter`.
- Security rules for assignment-based authorization and admin override.
- Composite index definition for status and assignee queries.

## Firestore Data Model

- `tasks` collection
- `tasks/{taskId}/steps`
- `tasks/{taskId}/conversations`
- `tasks/{taskId}/activity_logs`
- `users` collection

All structures align to the requested schema while avoiding deeply nested document payloads.

## Deploy Notes

1. Create a Firebase project and enable Auth + Firestore.
2. Deploy rules and indexes:
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only firestore:indexes`
3. Host static files (`index.html`, `styles.css`, `app.js`) with Firebase Hosting or any static host.

## Advanced Integrations

- FCM notifications can be added for mentions and stuck-task alerts.
- Storage can be added for file attachments under each task.
