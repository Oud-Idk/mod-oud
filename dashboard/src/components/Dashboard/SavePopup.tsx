interface SavePopupProps {
    handleCancel: () => void;
    handleSave: () => void;
    isSaving: boolean;
}

export function SavePopup({ handleCancel, handleSave, isSaving }: SavePopupProps) {

    return <div
        className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 bg-white dark:bg-black border rounded-lg shadow-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Unsaved changes
            </p>
            <p className="text-xs text-neutral-500">
                You have unsaved changes to your welcome settings.
            </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium dark:hover:bg-neutral-500/40 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
                Reset
            </button>
            <button
                onClick={() => {
                    if (!isSaving) {
                        handleSave();
                    }
                }}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 rounded-md transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
                {isSaving ? 'Saving...' : 'Save'}
            </button>
        </div>
    </div>;
}