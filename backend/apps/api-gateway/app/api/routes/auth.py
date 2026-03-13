import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.db import get_db
from app.models import School, User


router = APIRouter(prefix="/auth", tags=["auth"])

PHONE_RE = re.compile(r"^1\d{10}$")


class RegisterRequest(BaseModel):
    school_id: int
    major: str = Field(min_length=1, max_length=128)
    class_name: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=11, max_length=20)
    password: str = Field(min_length=6, max_length=64)


class RegisterResponse(BaseModel):
    id: int
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SchoolResponse(BaseModel):
    id: int
    name: str


@router.get("/schools", response_model=list[SchoolResponse])
def search_schools(
    q: str = "",
    limit: int = 20,
    db: Session = Depends(get_db),
) -> list[SchoolResponse]:
    keyword = q.strip()
    query = db.query(School)
    if keyword:
        query = query.filter(School.name.like(f"%{keyword}%"))
    schools = query.order_by(School.name.asc()).limit(max(1, min(limit, 50))).all()
    return [SchoolResponse(id=item.id, name=item.name) for item in schools]


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    if not PHONE_RE.match(payload.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Player username must be a mobile phone number",
        )

    school = db.query(School).filter(School.id == payload.school_id).first()
    if not school:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid school_id",
        )

    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="player",
        school_id=payload.school_id,
        major=payload.major.strip(),
        class_name=payload.class_name.strip(),
        full_name=payload.full_name.strip(),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return RegisterResponse(id=user.id, username=user.username, role=user.role)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )
    return LoginResponse(access_token=token)


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return current_user
