
export class ToolService {
    constructor(baseUrl = '/api/tools') {
        this.baseUrl = baseUrl;
        this.apiKey = localStorage.getItem('apiKey') || '';
    }

    async getTools() {
        try {
            const res = await fetch(this.baseUrl, {
                headers: this._headers()
            });
            if (!res.ok) throw new Error('Failed to fetch tools');
            const json = await res.json();
            return json.data || [];
        } catch (err) {
            console.error(err);
            return [];
        }
    }

    async saveTool(tool) {
        try {
            const res = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(tool)
            });
            if (!res.ok) throw new Error('Failed to save tool');
            const json = await res.json();
            return json.id;
        } catch (err) {
            console.error(err);
            return null;
        }
    }

    async deleteTool(id) {
        try {
            const res = await fetch(`${this.baseUrl}/${id}`, {
                method: 'DELETE',
                headers: this._headers()
            });
            return res.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    _headers() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
        };
    }
}
