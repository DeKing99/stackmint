from app.services.collection.rules import CollectionUnit


def calculate_activity_completion(
    expected_units: list[CollectionUnit],
) -> float | None:
    if not expected_units:
        return None

    completed = sum(
        1 for unit in expected_units
        if unit.completed
    )

    return completed / len(expected_units) * 100