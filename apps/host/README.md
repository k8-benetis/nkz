# 🌾 Nekazari Frontend

Modern React application for the Nekazari Agricultural Platform.

## 🚀 Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Zustand** - State management
- **Lucide React** - Icons

## 📋 Features

### ✅ Authentication
- JWT-based authentication
- Login and registration pages
- Protected routes
- Token management

### ✅ Multi-language Support
- Spanish, English, Catalan, Basque, French, Portuguese
- Integrated with backend i18n service
- Automatic language detection

### ✅ Dashboard
- Overview of robots, sensors, and parcels
- Real-time data from FIWARE Orion-LD
- Responsive design

### ✅ NGSI-LD Integration
- Full CRUD operations for entities
- Type-safe TypeScript interfaces
- Proper NGSI-LD headers and context

## 🛠️ Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Local Development

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

Create a `.env` file:

```env
VITE_API_URL=http://localhost
VITE_CESIUM_ION_TOKEN=your_token_here
```

## 🐳 Docker

### Build Docker Image

```bash
docker build -t nekazari-frontend .
```

### Run Container

```bash
docker run -p 80:80 nekazari-frontend
```

## 📦 Project Structure

```
frontend/
├── src/
│   ├── components/      # Reusable React components
│   │   └── ProtectedRoute.tsx
│   ├── context/         # React Context providers
│   │   ├── AuthContext.tsx
│   │   └── I18nContext.tsx
│   ├── pages/           # Page components
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   └── Dashboard.tsx
│   ├── services/        # API services
│   │   └── api.ts
│   ├── types/           # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/           # Utility functions
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── Dockerfile           # Production Docker build
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 🎨 Components

### Authentication Context

Manages user authentication state and JWT tokens:

```typescript
const { user, login, register, logout, isAuthenticated } = useAuth();
```

### I18n Context

Handles multi-language translations:

```typescript
const { t, language, setLanguage, supportedLanguages } = useI18n();
```

### Protected Route

Wrapper for routes that require authentication:

```typescript
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>
```

## 🌐 API Integration

The frontend communicates with the backend using the API service:

```typescript
import api from '@/services/api';

// Authentication
await api.login({ email, password });
await api.register(userData);

// Entities
const robots = await api.getRobots();
const sensors = await api.getSensors();
const parcels = await api.getParcels();

// CRUD operations
await api.createRobot(robotData);
await api.updateRobot(id, updates);
await api.deleteRobot(id);
```

## 🔒 Security

- JWT tokens stored in localStorage
- Automatic token validation on app load
- Protected routes redirect to login
- CSRF protection via headers
- Secure HTTP-only cookies (if configured)

## 🎯 Routing

- `/` - Redirects to dashboard or login
- `/login` - Login page
- `/register` - Registration page
- `/dashboard` - Main dashboard (protected)

## 🚢 Deployment

### Production Build

```bash
npm run build
```

The build output will be in `dist/` directory.

### Nginx Configuration

The application uses HTML5 history mode, so configure Nginx:

```nginx
location / {
    root /usr/share/nginx/html/frontend;
    try_files $uri $uri/ /index.html;
}
```

### Docker Compose

Included in the main `docker-compose.ngsi-ld.yml` file:

```bash
cd infrastructure
docker-compose up frontend
```

## 📝 TODO

- [ ] Add unit tests (Jest + React Testing Library)
- [ ] Add E2E tests (Playwright/Cypress)
- [ ] Implement robot management pages
- [ ] Implement sensor management pages
- [ ] Implement parcel management pages
- [ ] Add Cesium 3D visualization
- [ ] Add WebSocket for real-time updates
- [ ] Add Grafana dashboard integration
- [ ] Add notification system
- [ ] Add PWA support

## 📄 License

Apache 2.0 - See LICENSE file for details
