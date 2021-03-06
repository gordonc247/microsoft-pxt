interface PageMetadata {
    title: string;
    description?: string;
    infoUrl?: string;
}

interface SkillMap {
    mapId: string;
    displayName: string;
    description?: string;
    prerequisites: MapPrerequisite[];
    completionUrl?: string;

    activities: {[index: string]: MapActivity};
    root: MapActivity;
}

type MapPrerequisite = TagPrerequisite | MapFinishedPrerequisite;

interface TagPrerequisite {
    type: "tag"
    tag: string;
    numberCompleted: number;
}

interface MapFinishedPrerequisite {
    type: "map";
    mapId: string;
}

interface MapActivity {
    activityId: string;

    displayName: string;
    description?: string;
    tags: string[];

    type: "tutorial";
    editor: "blocks" | "js" | "py";

    url: string;
    imageUrl?: string;

    next: MapActivity[];
    nextIds: string[];
}

type CompletedTags = {[index: string]: number}

interface UserState {
    isDebug?: boolean;
    id: string;
    mapProgress: {[index: string]: MapState};

    // Indexed by the skillmap page url
    completedTags: {[index: string]: CompletedTags};
}

interface MapState {
    mapId: string;
    activityState: {[index: string]: ActivityState};
}

interface ActivityState {
    activityId: string;
    isCompleted: boolean;
    headerId?: string;
    currentStep?: number;
    maxSteps?: number;
}