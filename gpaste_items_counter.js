const St = imports.gi.St;
const Lang = imports.lang;

const GPasteItemsCounter = new Lang.Class({
    Name: "GPasteItemsCounter",

    _init: function(items_view) {
        this.actor = new St.Table();

        this._items_view = items_view;
        this._items_view.connect(
            "displayed-items-changed",
            Lang.bind(this, this._on_changed)
        );
        this._count_text = "Total: %s";
        this._count_label = new St.Label();

        this.actor.add(this._count_label, {
            row: 0,
            col: 0,
            x_fill: false,
            x_expand: false,
            y_fill: false,
            y_expand: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
    },

    _on_changed: function() {
        let count = this._items_view.displayed_length;
        this._count_label.set_text(this._count_text.format(count));
    },
});
