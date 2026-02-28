<!-- Copilot Instructions for SMA 15 Makassar LMS -->

## Project Overview
This is a Learning Management System (LMS) for SMA 15 Makassar built with Next.js 14, TypeScript, and Tailwind CSS.

## Tech Stack
- **Frontend Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Context API
- **HTTP Client:** Axios
- **Real-time:** Socket.io Client
- **Charts:** Recharts
- **Icons:** Lucide React

## Project Structure
```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── layouts/      # Layout components (DashboardLayout)
│   └── ui/           # Reusable UI components
├── context/          # React Context providers (AuthContext)
├── hooks/            # Custom React hooks (useExamMode, useSocket)
├── services/         # API service functions
└── types/            # TypeScript type definitions
```

## User Roles
- **Admin:** User & class management, statistics
- **Guru (Teacher):** Attendance sessions, exam creation, monitoring
- **Siswa (Student):** QR attendance, take exams, view materials

## Coding Conventions
- Use TypeScript for all new files
- Follow existing component patterns
- Use Tailwind CSS for styling
- Place API calls in services/api.ts
- Use Context for global state

## Key Features
- Dynamic QR Code attendance (anti-titip)
- CBT Exam with anti-cheat measures
- Real-time camera monitoring
- Role-based dashboards

## Backend Requirements
- Laravel 11 API server (separate project)
- home server docker for hosting backend and database
- mysql database for data storage
