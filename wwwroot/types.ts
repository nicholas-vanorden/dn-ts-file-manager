export interface BrowseResult {
    path: string;
    fullPath: string;
    parent?: string | null;
    directories: string[];
    files: FileDetails[];
}

export interface FileDetails {
    name: string;
    size: number;
    modified: string;
}