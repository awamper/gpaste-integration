const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;

const Me = ExtensionUtils.getCurrentExtension();
const ListView = Me.imports.list_view;

const GPasteListView = new Lang.Class({
    Name: 'GPasteListView',
    Extends: ListView.ListView,

    _init: function(params) {
        this.parent(params);
    },

    _remove_display: function(display) {
        let index = this._displays.indexOf(display);

        if(index !== -1) {
            this._displays.splice(index, 1);
        }

        display.destroy();
    },

    get_display_for_index: function(index) {
        if(this._displays[index]) {
            return this._displays[index];
        }
        else {
            return false;
        }
    },

    fade_out_display: function(display) {
        [x, y] = display.get_transformed_position();
        let clone = new Clutter.Clone({
            source: display,
            width: display.width,
            height: display.height,
            x: x,
            y: y
        });
        Main.uiGroup.add_child(clone);

        Tweener.addTween(clone, {
            time: 0.7,
            opacity: 0,
            transition: 'easeInOutBounce',
            onComplete: Lang.bind(this, function() {
                clone.destroy();
            })
        });
    }
});
