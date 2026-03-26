import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from telemetry_worker.config import Settings
from telemetry_worker.event_sink import PostgreSQLSink
from telemetry_worker.notification_handler import (
    init_handler,
    router as notification_router,
)
from telemetry_worker.profiles import ProfileService
from telemetry_worker.routers import health
from telemetry_worker.subscription_manager import check_or_create_subscription

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Telemetry Worker starting up...")

    settings = Settings()

    # Initialize async connection pool (shared between sink and profiles)
    sink = PostgreSQLSink(
        dsn=settings.postgres_url,
        min_pool=5,
        max_pool=20,
    )
    await sink.start()

    # ProfileService gets the same pool for async DB queries
    profile_service = ProfileService(settings, pool=sink._pool)

    # Wire dependencies into notification handler
    init_handler(settings, profile_service, sink)

    # Check/create NGSI-LD subscriptions (sync, run in executor)
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, check_or_create_subscription)
    except Exception as e:
        logger.warning(f"Auto-subscription failed (non-fatal): {e}")

    yield

    # Shutdown: close pool
    await sink.stop()
    logger.info("Telemetry Worker shut down.")


app = FastAPI(
    title="Nekazari Telemetry Worker",
    version="2.0.0",
    lifespan=lifespan,
)

app.include_router(health.health_router)
app.include_router(notification_router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
