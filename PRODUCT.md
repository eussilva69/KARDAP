# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Restaurant owners and their teams configure a digital menu, service tables, products and customer-facing QR menus.

## Product Purpose

Kardap connects a restaurant's onboarding, operational dashboard and public digital menu to Firebase-backed restaurant data.

## Positioning

One restaurant record powers onboarding, QR tables, menu publishing and operational views without re-entering the same establishment data.

## Operating Context

Owners use the dashboard on desktop and mobile during setup and daily service. Guests open the public menu from individual table QR codes.

## Capabilities and Constraints

Next.js web application with Firebase Authentication, Firestore and Storage. The product supports Google/email login, onboarding, restaurant identity, categories, products, tables and QR menus. Existing functionality and Portuguese copy must remain intact during visual work.

## Brand Commitments

Product name: Kardap. The user supplied a binding monochromatic clinical-blueprint visual reference for the complete application.

## Evidence on Hand

Existing app routes, UI components and Firebase-backed data in `components/app.tsx`, `lib/restaurant-db.ts` and `lib/storage.ts`.

## Product Principles

- A restaurant's live Firebase data is the operational source of truth.
- Setup should lead directly to a usable menu and service workflow.
- Public menus should be simple and readable for guests.
- Dashboard controls should make daily operations easy to scan.
