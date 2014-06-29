const Lang = imports.lang;
const Params = imports.misc.params;

// adopted from https://github.com/myork/fuzzy
const Fuzzy = new Lang.Class({
    Name: "Fuzzy",

    _init: function(opts) {
        this.opts = Params.parse(opts, {
            // string to put before a matching character
            pre: '',
            // string to put after matching character
            post: '',
            // Optional function. Input is an element from the passed in
            // `arr`, output should be the string to test `pattern` against.
            // In this example, if `arr = [{crying: 'koala'}]` we would return
            // 'koala'.
            extract: false,
            // escape html symbols
            escape: false,
            case_sensitive: false,
            max_distance: 50,
            max_results: 0
        });
    },

    escape_html: function(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    },

    // If `pattern` matches `string`, wrap each matching character
    // in `opts.pre` and `opts.post`. If no match, return null
    match: function(pattern, string) {
        // String to compare against. This might be a lowercase version of the
        // raw string
        let compare_string =
            this.opts.case_sensitive && string || string.toLowerCase();
        pattern =
            this.opts.case_sensitive && pattern || pattern.toLowerCase();

        let pattern_idx = 0;
        let result = [];
        let total_score = 0;
        let curr_score = 0;
        let curr_distance = 0;

        // For each character in the string, either add it to the result
        // or wrap in template if its the next string in the pattern
        for(let idx = 0; idx < compare_string.length; idx++) {
            if(pattern_idx > 0 && curr_distance >= this.opts.max_distance) {
                let t = string.slice(idx);

                if(this.opts.escape) {
                    t = this.escape_html(t);
                }

                result[result.length] = t;
                break;
            }

            let ch = string[idx];

            if(compare_string[idx] === pattern[pattern_idx]) {
                if(this.opts.escape) ch = this.escape_html(ch);

                ch = this.opts.pre + ch + this.opts.post;
                pattern_idx += 1;

                // consecutive characters should increase
                // the score more than linearly
                curr_score += 1 + curr_score;
                curr_distance = 0;
            }
            else {
                if(this.opts.escape) ch = this.escape_html(ch);

                if(pattern_idx > 0) {
                    curr_distance++;
                    curr_score = -0.1 * curr_distance;
                }
            }

            total_score += curr_score;
            result[result.length] = ch;

            if(pattern_idx >= pattern.length) {
                let t = string.slice(idx + 1);

                if(this.opts.escape) {
                    t = this.escape_html(t);
                }

                result[result.length] = t;
                break;
            }
        }

        // return rendered string if we have a match for every char
        if(pattern_idx === pattern.length) {
            return {
                rendered: result.join(''),
                score: Math.round(total_score * 100) / 100
            };
        }

        return null;
    },

    // The normal entry point. Filters `arr` for matches against `pattern`.
    // It returns an array with matching values of the type:
    //
    //     [{
    //         string:   '<b>lah' // The rendered string
    //       , index:    2        // The index of the element in `arr`
    //       , original: 'blah'   // The original element in `arr`
    //     }]
    //
    filter: function(pattern, arr, callback) {
        let results = [];

        for(let i = 0; i < arr.length; i++) {
            let string = arr[i];

            if(this.opts.extract) {
                string = this.opts.extract(string);
            }

            let result = this.match(pattern, string);

            if(result !== null) {
                results.push({
                    string: result.rendered,
                    score: result.score,
                    index: i,
                    original: arr[i]
                });
            }
        }

        // Sort by score. Browsers are inconsistent wrt stable/unstable
        // sorting, so force stable by using the index in the case of tie.
        // See http://ofb.net/~sethml/is-sort-stable.html
        results.sort(function(a, b) {
            let compare = b.score - a.score;
            if(compare) return compare;
            return a.index - b.index;
        });

        if(this.opts.max_results > 0) {
            results = results.slice(0, this.opts.max_results);
        }

        callback(results);
    }
});
