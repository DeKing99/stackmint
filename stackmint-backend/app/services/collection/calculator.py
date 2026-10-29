from app.services.collection.rules import CollectionUnit


def calculate_activity_completion(
    expected_units: list[CollectionUnit],
):
    if not expected_units:
        return 100.0

    completed = sum(
        1 for unit in expected_units
        if unit.completed
    )

    return min(
        completed / len(expected_units),
        1.0,
    ) * 100