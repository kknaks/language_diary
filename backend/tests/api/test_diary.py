import pytest


@pytest.mark.asyncio
async def test_list_diaries_empty(client, seed_user):
    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["has_next"] is False
    assert data["next_cursor"] is None


@pytest.mark.asyncio
async def test_list_diaries_with_data(client, seed_diary):
    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["original_text"] == "오늘 회사에서 회의했어"


@pytest.mark.asyncio
async def test_list_diaries_cursor_pagination(client, seed_user, db_session):
    from datetime import datetime
    from app.models import Diary

    for i in range(3):
        db_session.add(Diary(
            user_id=1, original_text=f"diary {i}", status="draft",
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        ))
    await db_session.commit()

    resp = await client.get("/api/v1/diary?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["has_next"] is True

    resp2 = await client.get(f"/api/v1/diary?cursor={data['next_cursor']}&limit=2")
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    assert data2["has_next"] is False


@pytest.mark.asyncio
async def test_list_diaries_excludes_deleted(client, seed_diary, db_session):
    """Soft-deleted diaries should not appear in list."""
    from datetime import datetime
    seed_diary.deleted_at = datetime.utcnow()
    await db_session.commit()

    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 0


@pytest.mark.asyncio
async def test_get_diary_detail(client, seed_diary):
    resp = await client.get(f"/api/v1/diary/{seed_diary.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["original_text"] == "오늘 회사에서 회의했어"
    assert data["translated_text"] == "I had a meeting at work today"
    assert len(data["learning_cards"]) == 1
    assert data["learning_cards"][0]["content_en"] == "meeting"


@pytest.mark.asyncio
async def test_get_diary_not_found(client, seed_user):
    resp = await client.get("/api/v1/diary/999")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"]["code"] == "DIARY_NOT_FOUND"
    assert "diary_id=999" in data["error"]["detail"]


@pytest.mark.asyncio
async def test_update_diary(client, seed_diary):
    resp = await client.put(
        f"/api/v1/diary/{seed_diary.id}",
        json={"original_text": "수정된 일기"},
    )
    assert resp.status_code == 200
    assert resp.json()["original_text"] == "수정된 일기"


@pytest.mark.asyncio
async def test_update_diary_translated_text(client, seed_diary):
    resp = await client.put(
        f"/api/v1/diary/{seed_diary.id}",
        json={"translated_text": "Updated translation"},
    )
    assert resp.status_code == 200
    assert resp.json()["translated_text"] == "Updated translation"


@pytest.mark.asyncio
async def test_update_diary_no_fields(client, seed_diary):
    resp = await client.put(f"/api/v1/diary/{seed_diary.id}", json={})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_update_diary_not_found(client, seed_user):
    resp = await client.put("/api/v1/diary/999", json={"original_text": "x"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DIARY_NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_diary(client, seed_diary):
    resp = await client.delete(f"/api/v1/diary/{seed_diary.id}")
    assert resp.status_code == 204

    resp2 = await client.get("/api/v1/diary")
    assert len(resp2.json()["items"]) == 0


@pytest.mark.asyncio
async def test_delete_diary_not_found(client, seed_user):
    resp = await client.delete("/api/v1/diary/999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DIARY_NOT_FOUND"


@pytest.mark.asyncio
async def test_complete_diary(client, seed_diary):
    resp = await client.post(f"/api/v1/diary/{seed_diary.id}/complete")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert data["completed_at"] is not None


@pytest.mark.asyncio
async def test_complete_diary_already_completed(client, seed_diary):
    await client.post(f"/api/v1/diary/{seed_diary.id}/complete")
    resp = await client.post(f"/api/v1/diary/{seed_diary.id}/complete")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "DIARY_ALREADY_COMPLETED"


@pytest.mark.asyncio
async def test_complete_diary_not_found(client, seed_user):
    resp = await client.post("/api/v1/diary/999/complete")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DIARY_NOT_FOUND"
