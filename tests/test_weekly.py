from app.services.weekly import classify_group


def test_weekly_category_priority_and_labels():
    assert classify_group(["美容液"])["key"] == "skincare"
    assert classify_group(["眉マスカラ"])["key"] == "color"
    assert classify_group(["シートマスク・パック"])["key"] == "mask"
    assert classify_group(["日焼け止め・UVケア(顔用)", "化粧下地"])["key"] == "suncare"
    assert classify_group(["クッションファンデ"])["key"] == "base"
