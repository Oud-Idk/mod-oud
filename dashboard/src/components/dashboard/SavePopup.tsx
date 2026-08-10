import { JSX } from "react";
import { Button } from "@/components/ui/Button";
import Footer from "@/components/layout/Footer";

interface SavePopupProps {
    handleCancel: () => void;
    handleSave: () => void;
    isSaving: boolean;
}

export function SavePopup({ handleCancel, handleSave, isSaving }: SavePopupProps): JSX.Element {
    return <div
        className="fixed bottom-4 right-4 left-4 md:left-auto md:w-110 border border-border rounded-lg shadow-xl p-2 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
            <p>
                Unsaved changes
            </p>
            <Footer className="text-xs">
                You have unsaved changes to your welcome settings.
            </Footer>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={isSaving}
            >
                Reset
            </Button>
            <Button
                onClick={() => {
                    if (!isSaving) {
                        handleSave();
                    }
                }}
                disabled={isSaving}
            >
                {isSaving ? 'Saving...' : 'Save'}
            </Button>
        </div>
    </div>;
}