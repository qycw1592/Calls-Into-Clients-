# Calls Into Clients (CIC)

Calls Into Clients is an AI-powered business transformation and customer acquisition platform for service businesses.

## Purpose

CIC is designed to capture and convert opportunities across the customer journey: answering, qualification, scheduling, follow-up, review generation, customer communication, reporting, and coordinated AI employees.

## Repository Role

This repository is the canonical source of truth for the CIC web experience and product-facing frontend. Production should be deployed from reviewed, tested code in this repository rather than from one-off manual deployments.

## Environments

- `main` — production-ready code only
- Preview deployments — used to review changes before production
- Supabase `cic-dev` — development backend; production data changes require deliberate review

## Build Standards

- Premium, responsive, accessibility-conscious interface
- No fabricated testimonials, integrations, performance claims, or certifications
- Mobile-first validation
- Reusable components and clear separation of concerns
- Secrets only through environment variables; never committed to Git
- Preview and verify meaningful changes before production promotion

## CIC Brand Direction

The site should feel like a high-end technology platform rather than a generic AI agency: light, spacious, sophisticated, highly interactive, with CIC blue as the primary technology color and orange used selectively for conversion and opportunity.
