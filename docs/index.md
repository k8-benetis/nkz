---
title: Nekazari Core Architecture
description: Core infrastructure, NGSI-LD Smart Data Models, native risk evaluation, and environmental services.
sidebar:
  order: 1
---

# Nekazari Core Architecture

Welcome to the internal documentation of the Nekazari Core platform.

## NGSI-LD & Smart Data Models

The heart of Nekazari OS is the FIWARE Orion-LD context broker. All entities managed by the core strictly adhere to the ETSI ISG CIM NGSI-LD specification.
Furthermore, we natively adopt the official **Smart Data Models** (smartdatamodels.org) for Agrifood and Environment, ensuring global interoperability for entities like `AgriParcel`, `WeatherObserved`, and `Device`.

## Native Services

The Core comes batteries-included with powerful environmental and analytical services out-of-the-box:

### Native Agricultural Risk Evaluation
A dedicated `risk-engine` evaluates real-time telemetry and weather data against configurable thresholds to predict and alert on specific agricultural risks (e.g., frost, pests, drought stress).

### Weather Prediction
Integrated `weather-worker` services automatically fetch, cache, and structure meteorological forecasts and real-time observations for every registered parcel.

### Soil Status
Continuous tracking and calculation of soil moisture, temperature, and composition via telemetry and predictive models.