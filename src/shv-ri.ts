export class ShvRI {
    private ri: string;
    private methodSepIx: number;
    private signalSepIx?: number;

    constructor(ri: string) {
        const methodSepIx = ri.indexOf(':');
        if (methodSepIx === -1) {
            throw new Error('Method separator ":" is missing.');
        }

        const signalSepRelative = ri.indexOf(':', methodSepIx + 1);
        const signalSepIx = signalSepRelative !== -1 ? signalSepRelative : undefined;

        this.ri = ri;
        this.methodSepIx = methodSepIx;
        this.signalSepIx = signalSepIx;

        const method = this.method();
        if (method.length === 0) {
            throw new Error('Method must not be empty.');
        }

        const signal = this.signal();
        if (signal?.length === 0) {
            throw new Error('Signal, if present, must not be empty.');
        }
    }

    path() {
        return this.ri.slice(0, this.methodSepIx);
    }

    method() {
        if (this.signalSepIx !== undefined) {
            return this.ri.slice(this.methodSepIx + 1, this.signalSepIx);
        }

        return this.ri.slice(this.methodSepIx + 1);
    }

    signal() {
        if (this.signalSepIx !== undefined) {
            return this.ri.slice(this.signalSepIx + 1);
        }
    }

    hasSignal() {
        return this.signalSepIx !== undefined;
    }

    asString() {
        return this.ri;
    }

    static fromPathMethodSignal(path: string, method: string, signal?: string) {
        const m = method.length === 0 ? '*' : method;
        const ri = signal !== undefined
            ? `${path}:${m}:${signal}`
            : `${path}:${m}`;
        return new ShvRI(ri);
    }
}
