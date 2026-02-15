from fastapi import APIRouter, status

health_router = APIRouter(tags=["Health"])

@health_router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    return {"status": "ok"}
