import uuid
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session
from ..core.database import get_session
from ..core.security import SECRET_KEY, ALGORITHM
from ..schemas.auth import TokenData
from ..models.property import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user_token(token: Annotated[str, Depends(oauth2_scheme)]) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        if user_id is None:
            raise credentials_exception
        return TokenData(user_id=user_id, role=role)
    except JWTError:
        raise credentials_exception

async def get_current_user(
    token_data: Annotated[TokenData, Depends(get_current_user_token)],
    session: Annotated[Session, Depends(get_session)]
) -> User:
    try:
        user_uuid = uuid.UUID(token_data.user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")
        
    user = session.get(User, user_uuid)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
