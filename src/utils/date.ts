/**
 * Format a date string or Date object to a readable French date string.
 * Handles both DD/MM/YYYY (AstroBin CSV export format) and ISO YYYY-MM-DD.
 * @param dateInput - Date string (DD/MM/YYYY or YYYY-MM-DD) or Date object
 * @returns Formatted French date string, e.g. "14 juin 2024". Falls back to raw input if invalid.
 */
export function formatDate(dateInput: string | Date): string {
    let date: Date;

    if (typeof dateInput === 'string') {
        // Handle "DD/MM/YYYY" format often used in this project
        if (dateInput.includes('/')) {
            const parts = dateInput.split('/');
            if (parts.length === 3) {
                // Assume DD/MM/YYYY
                date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else {
                date = new Date(dateInput);
            }
        } else {
            date = new Date(dateInput);
        }
    } else {
        date = dateInput;
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
        return dateInput.toString(); // Fallback
    }

    return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}
