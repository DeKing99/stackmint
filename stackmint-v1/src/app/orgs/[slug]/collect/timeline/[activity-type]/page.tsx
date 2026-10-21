"use client";

import { useParams } from "next/navigation";

export default function ActivityTimelinePage() {
    const { "activity-type": activityType } = useParams<{ "activity-type": string }>();
    return (
        <h1>This is the timeline for {activityType}</h1>
    )
}