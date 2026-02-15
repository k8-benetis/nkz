import logging
import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager

from telemetry_worker.routers import health
from telemetry_worker.notification_handler import router as notification_router
from telemetry_worker.subscription_manager import check_or_create_subscription

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Check subscriptions
    logger.info("Telemetry Worker starting up...")
    try:
        # Run in executor to not block async loop if it takes time/retries
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, check_or_create_subscription)
    except Exception as e:
        logger.warning(f"Auto-subscription failed (non-fatal): {e}")
    
    yield
    
    # Shutdown
    logger.info("Telemetry Worker shutting down...")

app = FastAPI(
    title="Nekazari Telemetry Worker",
    version="1.0.0",
    lifespan=lifespan
)

app.include_router(health.health_router)
app.include_router(notification_router)

# Entry point for uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
