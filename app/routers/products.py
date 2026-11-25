"""商品浏览路由"""
from fastapi import APIRouter, HTTPException, Query

from .. import db

router = APIRouter(prefix="/api/products", tags=["商品"])


@router.get("", summary="商品列表（分类/搜索/分页）")
def list_products(
    category_id: int | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=12, ge=1, le=100),
):
    where = ["status='on'"]
    params: list = []
    if category_id:
        where.append("category_id=?")
        params.append(category_id)
    if q:
        where.append("(p.name LIKE ? OR p.description LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    cond = " AND ".join(where)
    with db.get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) c FROM products p WHERE {cond}", params).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT p.*, c.name AS category_name FROM products p
                LEFT JOIN categories c ON c.id=p.category_id
                WHERE {cond} ORDER BY p.created_at DESC, p.id DESC
                LIMIT ? OFFSET ?""",
            params + [size, (page - 1) * size],
        ).fetchall()
    items = [db.row_to_dict(r) for r in rows]
    return {"items": items, "total": total, "page": page, "size": size, "pages": (total + size - 1) // size}


@router.get("/{product_id}", summary="商品详情")
def get_product(product_id: int):
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?",
            (product_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "商品不存在")
    return db.row_to_dict(row)


@router.get("/meta/categories", summary="全部分类")
def list_categories():
    with db.get_conn() as conn:
        rows = conn.execute("SELECT * FROM categories ORDER BY sort, id").fetchall()
    return {"items": [db.row_to_dict(r) for r in rows]}
