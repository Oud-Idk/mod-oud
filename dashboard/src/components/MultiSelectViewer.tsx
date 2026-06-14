interface MultiSelectViewerProps {
    selectedList: string[];
    onDelete: (id: string) => void;
    map?: Record<string, string>;
    placeholder?: string;
    prefix?: string;
}

export function MultiSelectViewer({ selectedList, onDelete, map, placeholder, prefix }: MultiSelectViewerProps) {
    return (
        <div className="flex flex-wrap gap-2 mb-2">
            {selectedList.map((item) => (
                <span
                    key={item} className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-sm border"
                >
                    {prefix ? `${prefix}${(map ? map[item] : item).replace(prefix, "")}` : (map ? map[item] : item)}
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="hover:text-red-400 text-xs font-bold cursor-pointer"
                    >
                        ×
                    </button>
                </span>
            ))}
            {selectedList.length === 0 && placeholder && (
                <span className="text-sm italic">{placeholder}</span>
            )}
        </div>
    )
}