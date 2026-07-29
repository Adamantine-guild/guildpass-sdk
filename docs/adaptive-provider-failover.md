# Adaptive Multi-Provider Failover

## Overview

The adaptive multi-provider failover system provides health-based routing for RPC providers, automatically selecting the best-performing provider based on latency, error rate, and timeout frequency.

## Architecture

### Components

1. **HealthTracker** (`healthTracker.ts`)
   - Maintains rolling health scores per provider
   - Records success, failure, timeout events
   - Calculates health scores using exponential moving average

2. **AdaptiveContractProvider** (`adaptiveContractProvider.ts`)
   - Routes calls to best-scoring healthy provider
   - Handles provider degradation and recovery
   - Performs periodic health checks

### Health Scoring

| Factor | Weight | Description |
|--------|--------|-------------|
| Latency | 30% | Faster = higher score |
| Error Rate | 30% | Lower = higher score |
| Timeout Rate | 30% | Lower = higher score |
| Success Rate | 10% | Higher = higher score |

### Score Range

| Score | Status | Action |
|-------|--------|--------|
| 70-100 | Healthy | Used for routing |
| 40-69 | Degraded | Deprioritized |
| 0-39 | Unhealthy | Not used |

## Usage

### Basic Setup

```typescript
import { AdaptiveContractProvider } from './providers/adaptiveContractProvider';

const providers = [
  {
    name: 'provider1',
    url: 'https://provider1.com',
    timeout: 5000,
    maxRetries: 3,
    healthCheckInterval: 30000,
    enabled: true,
    weight: 1,
  },
  // ... more providers
];

const adaptiveProvider = new AdaptiveContractProvider(providers);
const result = await adaptiveProvider.execute(async (provider) => {
  // Use the provider to make the actual call
  return await someRpcCall(provider.url);
});
const status = adaptiveProvider.getHealthStatus();
console.log(status);
// {
//   'provider1': { status: 'healthy', score: 95 },
//   'provider2': { status: 'degraded', score: 45 },
// }
const weights = {
  latencyWeight: 0.4,  // Higher weight for latency
  errorWeight: 0.3,
  timeoutWeight: 0.2,
  successWeight: 0.1,
};
