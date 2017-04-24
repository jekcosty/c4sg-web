export class PageableResult<T> {
    constructor(
        public data: Array<T>,
        public totalItems: number
    ) {}     
}
