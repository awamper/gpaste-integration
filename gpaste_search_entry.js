const St = imports.gi.St;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Tooltips = Me.imports.tooltips;

const SEARCH_FLAGS = {
    ONLY_TEXT: '-t',
    ONLY_FILES: '-f',
    ONLY_LINKS: '-l'
};

const GPasteSearchEntry = new Lang.Class({
    Name: 'GPasteSearchEntry',
    Extends: St.Entry,

    _init: function() {
        this.parent({
            style_class: "gpaste-search-entry",
            hint_text: "Type to search",
            track_hover: true,
            can_focus: true
        });

        this.clutter_text.connect(
            'text-changed',
            Lang.bind(this, this._on_text_changed)
        );

        this._inactive_icon = new St.Icon({
            style_class: 'gpaste-search-entry-icon',
            icon_name: 'edit-find-symbolic',
            reactive: false
        });
        this._active_icon = new St.Icon({
            style_class: 'gpaste-search-entry-icon',
            icon_name: 'edit-clear-symbolic',
            reactive: true
        });

        this.set_secondary_icon(this._inactive_icon);
        this.connect(
            'secondary-icon-clicked',
            Lang.bind(this, this.clear)
        );

        Tooltips.get_manager().add_tooltip(this, {
            text: (
                'Append:\n' +
                '"-f" to search only files\n' +
                '"-t" - text\n' +
                '"-l" - links'
            )
        });

        this.term = '';
        this.flag = '';
    },

    _on_text_changed: function() {
        if(this.is_empty()) {
            this.set_secondary_icon(this._inactive_icon);
            return;
        }

        this._parse_text();
        this.set_secondary_icon(this._active_icon);
    },

    _parse_text: function() {
        if(this.is_empty()) {
            this.term = '';
            this.flag = '';
        }

        if(Utils.ends_with(this.text, SEARCH_FLAGS.ONLY_FILES)) {
            this.term = this.text.slice(0, -SEARCH_FLAGS.ONLY_FILES.length);
            this.flag = SEARCH_FLAGS.ONLY_FILES;
        }
        else if(Utils.ends_with(this.text, SEARCH_FLAGS.ONLY_TEXT)) {
            this.term = this.text.slice(0, -SEARCH_FLAGS.ONLY_TEXT.length);
            this.flag = SEARCH_FLAGS.ONLY_TEXT;
        }
        else if(Utils.ends_with(this.text, SEARCH_FLAGS.ONLY_LINKS)) {
            this.term = this.text.slice(0, -SEARCH_FLAGS.ONLY_LINKS.length);
            this.flag = SEARCH_FLAGS.ONLY_LINKS;
        }
        else {
            this.term = this.text;
            this.flag = '';
        }
    },

    is_empty: function() {
        if(Utils.is_blank(this.text) || this.text === this.hint_text) {
            return true
        }
        else {
            return false;
        }
    },

    clear: function() {
        this.set_text('');
    },
});
