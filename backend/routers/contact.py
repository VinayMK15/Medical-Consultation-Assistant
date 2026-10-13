
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import schemas
from auth_utils import get_current_admin
from database import get_db
from limiter import limiter
from models import ContactMessage

router = APIRouter(prefix="/api", tags=["Contact"])


@router.post("/contact", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def submit_contact_message(
    request: Request,
    payload: schemas.ContactCreate,
    db: Session = Depends(get_db),
):
    """
    Public contact form. Unauthenticated by design — the whole point is to be
    reachable before someone has an account.

    Rate limited because it is an open endpoint that writes to the database.
    No IP or user agent is stored: a support message carries only what the
    sender chose to type plus the address they replied from.
    """
    message = ContactMessage(
        name=payload.name.strip(),
        email=str(payload.email).strip().lower(),
        message=payload.message.strip(),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    # Echo only the id back, never the stored row.
    return {"id": message.id, "status": message.status}


@router.get("/admin/contact", response_model=list[schemas.ContactOut])
def list_contact_messages(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Admin inbox for contact submissions, newest first."""
    query = db.query(ContactMessage)
    if status_filter:
        query = query.filter(ContactMessage.status == status_filter)
    return query.order_by(ContactMessage.created_at.desc()).all()


@router.patch("/admin/contact/{message_id}")
def update_contact_status(
    message_id: int,
    status_filter: str = "read",
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """
    Move a message between "new" and "read".

    Takes the new state as a query param rather than a body because there is
    only one field to change and it keeps the route a true PATCH.
    """
    if status_filter not in {"new", "read"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status_filter must be 'new' or 'read'.",
        )

    message = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if message is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found."
        )

    message.status = status_filter
    db.commit()
    return {"id": message.id, "status": message.status}
