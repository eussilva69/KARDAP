# API Documentation Specification Template

## 1. Base URL & Environments
- **Production:** `https://api.example.com/v1`
- **Staging:** `https://staging-api.example.com/v1`

## 2. Authentication & Headers
All authenticated endpoints require:
```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
Content-Type: application/json
Accept: application/json
```

## 3. Standard Response Format
```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## 4. Error Responses & Status Codes
- `400 Bad Request`: Validation failure (returns field-level errors).
- `401 Unauthorized`: Missing or expired token.
- `403 Forbidden`: Insufficient permissions.
- `404 Not Found`: Resource does not exist.
- `429 Too Many Requests`: Rate limit exceeded (`Retry-After` header present).
- `500 Internal Server Error`: Unhandled exception (sanitized in production).

## 5. Endpoints Specification Table
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/login` | Authenticate user and issue tokens | No |
| `GET`  | `/users/me`   | Fetch current authenticated profile | Yes |
| `GET`  | `/items`      | List items with pagination | Yes |
