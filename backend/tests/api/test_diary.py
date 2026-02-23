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

    # Create 3 diaries
    for i in range(3):
        db_session.add(Diary(
            user_id=1, original_text=f"diary {i}", status="draft",
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        ))
    await db_session.commit()

    # Get first page with limit=2
    resp = await client.get("/api/v1/diary?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["has_next"] is True

    # Get next page
    resp2 = await client.get(f"/api/v1/diary?cursor={data['next_cursor']}&limit=2")
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    assert data2["has_next"] is False


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


@pytest.mark.asyncio
async def test_update_diary(client, seed_diary):
    resp = await client.put(
        f"/api/v1/diary/{seed_diary.id}",
        json={"original_text": "수정된 일기"},
    )
    assert resp.status_code == 200
    assert resp.json()["original_text"] == "수정된 일기"


@pytest.mark.asyncio
async def test_update_diary_no_fields(client, seed_diary):
    resp = await client.put(f"/api/v1/diary/{seed_diary.id}", json={})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_diary(client, seed_diary):
    resp = await client.delete(f"/api/v1/diary/{seed_diary.id}")
    assert resp.status_code == 204

    # Verify soft-deleted (not returned in list)
    resp2 = await client.get("/api/v1/diary")
    assert len(resp2.json()["items"]) == 0


@pytest.mark.asyncio
async def test_delete_diary_not_found(client, seed_user):
    resp = await client.delete("/api/v1/diary/999")
    assert resp.status_code == 404


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
    assert resp.status_code == 400
