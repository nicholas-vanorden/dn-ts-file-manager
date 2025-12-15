# dn-ts-file-manager

A lightweight web-based file manager built with **ASP.NET Core 8** and **TypeScript**, using **no frontend frameworks**.

The backend exposes a JSON API for browsing and manipulating files, and the frontend is a single-page application rendered entirely client-side using vanilla TypeScript and DOM APIs.

This project is intentionally simple, dependency-light, and easy to understand.

---

## Features

- Browse directories and files
- Deep-linkable navigation (URL reflects current path)
- Breadcrumb navigation
- File size and relative timestamp formatting
- Upload files with progress indicator
- Create folders
- Rename files and folders
- Delete files and folders (recursive)
- Download files
- No server-side HTML rendering
- No frontend frameworks (React, Angular, etc.)

---

## Tech Stack

- **Backend**: ASP.NET Core 8 (C#)
- **Frontend**: TypeScript + browser DOM APIs
- **UI**: Handwritten HTML + CSS
- **Transport**: JSON over HTTP
- **Build**: TypeScript compiler (`tsc`)

---

## Root Directory Configuration

All file operations are restricted to a single **server-side root directory**.  
This directory acts as a sandbox to prevent path traversal or access outside the configured scope.

### Recommended configuration (appsettings.json)

```json
{
  "FileManager": {
    "RootDirectory": "/path/to/root"
  }
}
```


## Prerequisites

- .NET Core 8
- Node.js 18+
- npm (or pnpm / yarn)

---


### Install frontend dependencies

```bash
npm install
```

### Build - Compile (TypeScript → JavaScript)

```bash
npx tsc
```

### Run

```bash
dotnet run
```