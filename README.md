# Sports Booking Platform - Backend API

A comprehensive Node.js/Express backend API for a sports facility booking platform with authentication, payments, and social features.

## Features

- **Authentication & Authorization**: JWT-based auth with role management
- **Facility Management**: CRUD operations for establishments and courts
- **Booking System**: Complete reservation system with availability checking
- **Payment Integration**: MercadoPago integration with split payment support
- **Geolocation**: Location-based search and filtering
- **Social Features**: Reviews, favorites, matches, and tournaments
- **Real-time Features**: Notifications and webhooks

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Cache**: Redis (optional)
- **Authentication**: JWT
- **Payments**: MercadoPago
- **Validation**: express-validator
- **Security**: helmet, cors, rate limiting

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- Redis (optional)
- MercadoPago account

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server
```bash
npm run dev
```

The server will start on `http://localhost:3001`

## Environment Variables

### Required
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_REFRESH_SECRET`: Secret key for refresh tokens
- `DATABASE_URL` or individual DB config variables
- `MERCADOPAGO_ACCESS_TOKEN`: MercadoPago access token

### Optional
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `REDIS_URL`: Redis connection string
- `FRONTEND_URL`: Frontend URL for CORS

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh JWT token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Establishments
- `GET /api/establishments` - List establishments with filtering
- `GET /api/establishments/:id` - Get establishment details
- `POST /api/establishments` - Create establishment (auth required)
- `PUT /api/establishments/:id` - Update establishment (owner only)

### Courts
- `GET /api/courts/establishment/:id` - Get courts for establishment
- `GET /api/courts/:id` - Get court details
- `GET /api/courts/:id/availability` - Check court availability
- `POST /api/courts` - Create court (establishment owner)

### Bookings
- `GET /api/bookings` - Get user bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id` - Update booking
- `DELETE /api/bookings/:id` - Cancel booking

### Payments
- `POST /api/payments` - Create payment
- `POST /api/payments/split` - Create split payment
- `GET /api/payments/:id/status` - Get payment status
- `POST /api/payments/webhook` - MercadoPago webhook

## Database Schema

The database includes the following main entities:
- Users (authentication and profiles)
- Establishments (sports facilities)
- Courts (individual playing areas)
- Bookings (reservations)
- Payments (payment tracking)
- SplitPayments (group payment management)
- Reviews, Favorites, Notifications

## Deployment

### Render Deployment

1. Connect your GitHub repository to Render
2. Use the provided `render.yaml` configuration
3. Set environment variables in Render dashboard
4. Deploy automatically on git push

### Docker Deployment

```bash
# Build image
docker build -t sports-booking-backend .

# Run container
docker run -p 3001:3001 --env-file .env sports-booking-backend
```

## Development

### Project Structure
```
src/
├── controllers/     # Route handlers
├── models/         # Database models
├── routes/         # API routes
├── middleware/     # Custom middleware
├── services/       # Business logic
├── utils/          # Utility functions
└── config/         # Configuration files
```

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run migrate` - Run database migrations

## Security Features

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting
- CORS configuration
- Input validation and sanitization
- SQL injection prevention
- XSS protection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License
