"""
MODULE_DISPLAY_NAME Backend - API Routes

Example CRUD routes demonstrating SDK/platform patterns.
Replace with your module's actual functionality.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.middleware import TokenPayload, get_current_user, get_tenant_id, require_roles


# =============================================================================
# Router Setup
# =============================================================================

router = APIRouter(tags=["MODULE_DISPLAY_NAME"])


# =============================================================================
# Models
# =============================================================================

class DataItem(BaseModel):
    """Example data model."""
    id: str
    name: str
    description: Optional[str] = None
    value: float = 0.0
    metadata: dict = Field(default_factory=dict)


class DataItemCreate(BaseModel):
    """Model for creating a new data item."""
    name: str
    description: Optional[str] = None
    value: float = 0.0
    metadata: dict = Field(default_factory=dict)


class DataItemUpdate(BaseModel):
    """Model for updating a data item."""
    name: Optional[str] = None
    description: Optional[str] = None
    value: Optional[float] = None
    metadata: Optional[dict] = None


class DataListResponse(BaseModel):
    """Response model for listing data items."""
    items: list[DataItem]
    total: int
    page: int
    page_size: int


# =============================================================================
# In-Memory Storage (Replace with Database in Production)
# =============================================================================

_data_store: dict[str, dict[str, DataItem]] = {}


def _get_tenant_store(tenant_id: str) -> dict[str, DataItem]:
    """Get or create data store for a tenant."""
    if tenant_id not in _data_store:
        _data_store[tenant_id] = {}
    return _data_store[tenant_id]


# =============================================================================
# Routes
# =============================================================================

@router.get("/data", response_model=DataListResponse)
async def list_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    user: TokenPayload = Depends(get_current_user),
):
    """
    List all data items for the current tenant.
    
    - Supports pagination via `page` and `page_size` parameters
    - Optional search filter on name
    """
    store = _get_tenant_store(tenant_id)
    
    # Filter by search term
    items = list(store.values())
    if search:
        items = [item for item in items if search.lower() in item.name.lower()]
    
    # Paginate
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = items[start:end]
    
    return DataListResponse(
        items=paginated,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/data/{item_id}", response_model=DataItem)
async def get_data(
    item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    user: TokenPayload = Depends(get_current_user),
):
    """Get a specific data item by ID."""
    store = _get_tenant_store(tenant_id)
    
    if item_id not in store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id '{item_id}' not found"
        )
    
    return store[item_id]


@router.post("/data", response_model=DataItem, status_code=status.HTTP_201_CREATED)
async def create_data(
    data: DataItemCreate,
    tenant_id: str = Depends(get_tenant_id),
    user: TokenPayload = Depends(get_current_user),
):
    """
    Create a new data item.
    
    The item ID is auto-generated.
    """
    import uuid
    
    store = _get_tenant_store(tenant_id)
    
    item_id = str(uuid.uuid4())[:8]
    item = DataItem(
        id=item_id,
        name=data.name,
        description=data.description,
        value=data.value,
        metadata=data.metadata,
    )
    
    store[item_id] = item
    return item


@router.put("/data/{item_id}", response_model=DataItem)
async def update_data(
    item_id: str,
    data: DataItemUpdate,
    tenant_id: str = Depends(get_tenant_id),
    user: TokenPayload = Depends(get_current_user),
):
    """Update an existing data item."""
    store = _get_tenant_store(tenant_id)
    
    if item_id not in store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id '{item_id}' not found"
        )
    
    existing = store[item_id]
    
    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    updated_item = DataItem(
        id=existing.id,
        name=update_data.get("name", existing.name),
        description=update_data.get("description", existing.description),
        value=update_data.get("value", existing.value),
        metadata=update_data.get("metadata", existing.metadata),
    )
    
    store[item_id] = updated_item
    return updated_item


@router.delete("/data/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_data(
    item_id: str,
    tenant_id: str = Depends(get_tenant_id),
    user: TokenPayload = Depends(get_current_user),
):
    """Delete a data item."""
    store = _get_tenant_store(tenant_id)
    
    if item_id not in store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id '{item_id}' not found"
        )
    
    del store[item_id]


# =============================================================================
# Admin Routes (Role-Protected)
# =============================================================================

@router.get("/admin/stats")
async def get_stats(
    user: TokenPayload = Depends(require_roles("TenantAdmin", "PlatformAdmin")),
):
    """
    Get module statistics.
    
    Requires TenantAdmin or PlatformAdmin role.
    """
    total_tenants = len(_data_store)
    total_items = sum(len(store) for store in _data_store.values())
    
    return {
        "total_tenants": total_tenants,
        "total_items": total_items,
        "user": user.email,
    }
