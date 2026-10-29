def calculate_overall_completion(
    activities: list[dict],
) -> float | None:

    total_expected = sum(
        activity["expected_units"]
        for activity in activities
    )

    if total_expected == 0:
        return None

    total_completed = sum(
        activity["completed_units"]
        for activity in activities
    )

    return (
        total_completed /
        total_expected
    ) * 100